import { getConfig, isSandbox } from '@/lib/config'
import { getDb } from '@/lib/db/client'
import { notFound } from '@/lib/http'
import { formatMoney } from '@/lib/money'
import { fmtTime, iso } from '@/lib/time'
import type {
  BookingSummary,
  CaseStatus,
  CaseSummary,
  CaseView,
  FactSnapshot,
  OperationState,
  ReceiptSummary,
  ReceiptView,
  SystemStatus,
} from '@/lib/view-types'
import { buildTruth, loadBookingFacts } from './truth'

function caseStatus(state: string): CaseStatus {
  if (state === 'RESOLVED_REFUNDED') return 'RESOLVED'
  if (state === 'EXECUTING' || state === 'VERIFYING') return 'REFUND_PENDING'
  return 'NEEDS_RESOLUTION'
}

const EVENT_LABELS: Record<string, string> = {
  BOOKING_CREATED: 'Booking created',
  ORDER_CREATED: 'PayPal order created',
  BUYER_CANCELLED: 'Buyer cancelled',
  PAYMENT_CAPTURED: 'Capture verified',
  CAPTURE_UNKNOWN: 'Capture outcome unknown',
  CAPTURE_REJECTED: 'Capture rejected',
  CAPTURE_NEEDS_REVIEW: 'Capture needs review',
  MERCHANT_CONFIRMED_UNFULFILLABLE: 'Merchant failure confirmed',
  ANALYSIS_REQUESTED: 'Analysis requested',
  ANALYSIS_COMPLETED: 'Analysis completed',
  ANALYSIS_FAILED: 'Analysis failed',
  PLAN_ACCEPTED: 'Plan accepted',
  REFUND_SENDING: 'Refund sending',
  REFUND_ACCEPTED: 'Refund accepted',
  REFUND_OUTCOME_UNKNOWN: 'Refund outcome unknown',
  REFUND_PENDING: 'Refund pending',
  REFUND_CONFIRMED: 'Refund confirmed',
  REFUND_REJECTED: 'Refund rejected',
  REFUND_NEEDS_REVIEW: 'Refund needs review',
  WEBHOOK_RECEIVED: 'Webhook received',
}

function operationCopy(state: OperationState, refundId: string | null, reason: string | null) {
  switch (state) {
    case 'QUEUED':
      return { message: 'Refund queued with a persisted request ID.', nextAction: 'The worker re-verifies the capture before the first send.' }
    case 'SENDING':
      return { message: 'Sending the persisted refund request.', nextAction: 'Waiting for the provider response.' }
    case 'UNKNOWN':
      return {
        message: 'Refund outcome unknown: the provider response did not arrive.',
        nextAction: 'Encore replays the same request ID and body. It will not create a second refund.',
      }
    case 'PROVIDER_PENDING':
      return {
        message: `PayPal reports refund ${refundId} as PENDING.`,
        nextAction: 'Polling that refund ID directly. No second request is sent while pending.',
      }
    case 'SUCCEEDED':
      return { message: `Refund ${refundId} verified COMPLETED.`, nextAction: 'Receipt generated.' }
    case 'REJECTED':
    case 'MANUAL_REVIEW':
      return {
        message: reason ?? 'The refund requires review.',
        nextAction: 'Review in the provider dashboard. Encore never mints a retry intent.',
      }
  }
}

export async function getCaseView(workspaceId: string, caseId: string): Promise<CaseView> {
  const db = await getDb()
  const { rows } = await db.query<{ id: string; booking_id: string; state: string; review_reason: string | null; updated_at: Date }>(
    'SELECT id, booking_id, state, review_reason, updated_at FROM recovery_cases WHERE id = $1 AND workspace_id = $2',
    [caseId, workspaceId],
  )
  const c = rows[0]
  if (!c) throw notFound()

  const facts = await loadBookingFacts(db, c.booking_id)
  const truth = buildTruth(facts)
  const { booking, operation: op } = facts

  const { rows: analyses } = await db.query<{
    id: string; state: NonNullable<CaseView['analysis']>['state']
    model: string; output: { disposition: string; summary: string; reasonCodes: string[]; missingInformation: string[] } | null
    error_code: string | null; error_message: string | null
  }>('SELECT id, state, model, output, error_code, error_message FROM analyses WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1', [caseId])
  const a = analyses[0]

  const { rows: plans } = await db.query<{
    id: string; amount_cents: number; currency: string; summary: string; evidence: { sourceId: string }[]; expires_at: Date
  }>(
    "SELECT id, amount_cents, currency, summary, evidence, expires_at FROM recovery_plans WHERE case_id = $1 AND state = 'READY' AND expires_at > now() ORDER BY created_at DESC LIMIT 1",
    [caseId],
  )
  const plan = plans[0]

  const { rows: receipts } = await db.query<{ content: Omit<ReceiptView, 'contentHash'>; content_hash: string }>(
    'SELECT content, content_hash FROM evidence_receipts WHERE case_id = $1 ORDER BY version DESC LIMIT 1',
    [caseId],
  )

  const { rows: faults } = await db.query<{ triggered_at: Date | null }>(
    "SELECT triggered_at FROM armed_faults WHERE case_id = $1 AND fault = 'DROP_REFUND_RESPONSE'",
    [caseId],
  )

  const { rows: events } = await db.query<{
    id: string; type: string; source: string; summary: string; created_at: Date
    snapshot: { booking: FactSnapshot; fulfillment: FactSnapshot; paypal: FactSnapshot } | null
  }>('SELECT id, type, source, summary, created_at, snapshot FROM audit_events WHERE booking_id = $1 ORDER BY created_at ASC', [c.booking_id])

  const actionVerb = isSandbox() ? 'Issue sandbox refund' : 'Issue fixture refund'
  const opInFlight = !!op && ['QUEUED', 'SENDING', 'UNKNOWN', 'PROVIDER_PENDING'].includes(op.state)
  const busy = opInFlight || ['ANALYZING', 'EXECUTING', 'VERIFYING'].includes(c.state)

  return {
    id: c.id,
    code: booking.code,
    title: booking.title,
    bookingId: booking.id,
    mode: isSandbox() ? 'SANDBOX' : 'FIXTURE',
    status: caseStatus(c.state),
    caseState: c.state,
    reviewReason: c.review_reason,
    amountCents: booking.amount_cents,
    currency: booking.currency,
    updatedAt: fmtTime(c.updated_at),
    mismatch: truth.mismatch,
    booking: truth.booking,
    fulfillment: truth.fulfillment,
    paypal: truth.paypal,
    brokenSegment: truth.brokenSegment,
    analysis: a
      ? {
          id: a.id,
          state: a.state,
          model: a.model,
          disposition: a.output?.disposition ?? null,
          summary: a.output?.summary ?? null,
          reasonCodes: a.output?.reasonCodes ?? [],
          missingInformation: a.output?.missingInformation ?? [],
          error: a.error_code ? `${a.error_code}: ${a.error_message ?? ''}` : null,
        }
      : null,
    preview: plan && !op
      ? {
          planId: plan.id,
          recommendation: 'Full refund to the original payer',
          amountCents: plan.amount_cents,
          sources: [...new Set(plan.evidence.map((e) => e.sourceId))],
          actionLabel: `${actionVerb} - ${formatMoney(plan.amount_cents, plan.currency)}`,
          explanation: plan.summary,
          expiresAt: iso(plan.expires_at)!,
        }
      : null,
    operation: op
      ? {
          id: op.id,
          state: op.state as OperationState,
          ...operationCopy(op.state as OperationState, op.provider_refund_id, op.review_reason),
          refundId: op.provider_refund_id,
          sendAttempts: op.send_attempts,
        }
      : null,
    receipt: receipts[0] ? { ...receipts[0].content, contentHash: receipts[0].content_hash } : null,
    events: events.map((e) => ({
      id: e.id,
      label: EVENT_LABELS[e.type] ?? e.type,
      source: e.source,
      time: fmtTime(e.created_at),
      summary: e.summary,
    })),
    snapshots: events
      .filter((e) => e.snapshot)
      .map((e) => ({ eventId: e.id, ...e.snapshot! })),
    fault: { armed: faults.length > 0, triggered: !!faults[0]?.triggered_at },
    can: {
      analyze: !op && !busy && c.state !== 'RESOLVED_REFUNDED',
      execute: !!plan && !op && c.state === 'READY',
      reconcile: !!op && op.state !== 'SUCCEEDED',
      armFault: !op && faults.length === 0,
    },
    busy,
  }
}

export async function listCases(workspaceId: string): Promise<CaseSummary[]> {
  const db = await getDb()
  const { rows } = await db.query<{
    id: string; state: string; updated_at: Date; code: string; title: string; amount_cents: number; currency: string
  }>(
    `SELECT c.id, c.state, c.updated_at, b.code, b.title, b.amount_cents, b.currency
     FROM recovery_cases c JOIN bookings b ON b.id = c.booking_id
     WHERE c.workspace_id = $1 ORDER BY c.updated_at DESC LIMIT 100`,
    [workspaceId],
  )
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: caseStatus(r.state),
    caseState: r.state,
    amountCents: r.amount_cents,
    currency: r.currency,
    updatedAt: fmtTime(r.updated_at),
  }))
}

export async function listBookings(workspaceId: string): Promise<BookingSummary[]> {
  const db = await getDb()
  const { rows } = await db.query<{
    id: string; code: string; title: string; amount_cents: number; currency: string; payment_state: string
    fulfillment_state: string; created_at: Date; case_id: string | null; order_state: string | null; approve_url: string | null
  }>(
    `SELECT b.id, b.code, b.title, b.amount_cents, b.currency, b.payment_state, b.fulfillment_state, b.created_at,
       c.id AS case_id, o.create_state AS order_state, o.approve_url
     FROM bookings b
     LEFT JOIN recovery_cases c ON c.booking_id = b.id
     LEFT JOIN payment_orders o ON o.booking_id = b.id AND o.create_state NOT IN ('CANCELLED','FAILED','EXPIRED')
     WHERE b.workspace_id = $1 ORDER BY b.created_at DESC LIMIT 50`,
    [workspaceId],
  )
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    amountCents: r.amount_cents,
    currency: r.currency,
    paymentState: r.payment_state,
    fulfillmentState: r.fulfillment_state,
    caseId: r.case_id,
    orderState: r.order_state,
    approveUrl: r.order_state === 'CREATED' ? r.approve_url : null,
    createdAt: fmtTime(r.created_at),
  }))
}

export async function listReceipts(workspaceId: string): Promise<ReceiptSummary[]> {
  const db = await getDb()
  const { rows } = await db.query<{ case_id: string; version: number; content: ReceiptView; code: string; currency: string }>(
    `SELECT r.case_id, r.version, r.content, b.code, b.currency
     FROM evidence_receipts r JOIN recovery_cases c ON c.id = r.case_id JOIN bookings b ON b.id = c.booking_id
     WHERE r.workspace_id = $1 ORDER BY r.created_at DESC`,
    [workspaceId],
  )
  return rows.map((r) => ({
    caseId: r.case_id,
    code: r.code,
    version: r.version,
    refundId: r.content.refundId,
    refundCents: r.content.refundCents,
    currency: r.currency,
    generatedAt: fmtTime(r.content.generatedAt),
    verifiedAgainst: r.content.verifiedAgainst,
  }))
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const c = getConfig()
  const db = await getDb()
  const { rows } = await db.query<{ last: Date | null }>('SELECT max(last_seen_at) AS last FROM worker_heartbeats')
  return {
    mode: c.APP_MODE === 'sandbox' ? 'SANDBOX' : 'FIXTURE',
    database: db.kind,
    aiModel: c.AI_MODEL,
    paypalConfigured: !!(c.PAYPAL_CLIENT_ID && c.PAYPAL_CLIENT_SECRET && c.PAYPAL_MERCHANT_ID),
    webhookConfigured: !!c.PAYPAL_WEBHOOK_ID,
    missing: c.missing,
    workerLastSeen: rows[0]?.last ? fmtTime(rows[0].last) : null,
  }
}
