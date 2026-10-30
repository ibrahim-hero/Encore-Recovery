import { expectedMerchantId } from '@/lib/config'
import type { Queryable } from '@/lib/db/client'
import { POLICY_ID } from '@/lib/db/seed'
import { centsToDecimal } from '@/lib/money'
import type { EligibilityInput } from './eligibility'
import { loadBookingFacts, type BookingFacts } from './truth'

// The only data the model ever sees. Built server-side from owned records.
export type AnalysisSnapshot = {
  caseId: string
  booking: {
    sourceId: string
    code: string
    title: string
    amount: string
    currency: string
    payment_status: string
    fulfillment_status: string
    fulfillment_reason: string | null
    merchant_confirmed: boolean
    simulated_failure: boolean
  }
  policy: { sourceId: string; version: string; text: string }
  payment: {
    sourceId: string
    status: string
    amount: string
    currency: string
    payee_matches_configured_merchant: boolean
  } | null
  operation: { sourceId: string; state: string } | null
  untrustedCustomerNotes: { label: 'UNTRUSTED_CUSTOMER_DATA'; notes: string[] }
}

// Must cover every fact field the analysis tools return for each source.
export const EVIDENCE_FIELDS: Record<string, string[]> = {
  booking: [
    'code',
    'title',
    'amount',
    'currency',
    'payment_status',
    'fulfillment_status',
    'fulfillment_reason',
    'merchant_confirmed',
    'simulated_failure',
  ],
  policy: ['version', 'text'],
  capture: ['status', 'amount', 'currency', 'payee_matches_configured_merchant'],
  operation: ['state'],
}

/** Map of sourceId -> allowed fields that exist in this exact snapshot. */
export function allowedEvidence(s: AnalysisSnapshot): Map<string, string[]> {
  const m = new Map<string, string[]>()
  m.set(s.booking.sourceId, EVIDENCE_FIELDS.booking)
  m.set(s.policy.sourceId, EVIDENCE_FIELDS.policy)
  if (s.payment) m.set(s.payment.sourceId, EVIDENCE_FIELDS.capture)
  if (s.operation) m.set(s.operation.sourceId, EVIDENCE_FIELDS.operation)
  return m
}

export type CaseContext = {
  caseId: string
  workspaceId: string
  facts: BookingFacts
  policy: { id: string; version: string; body: string; content_hash: string }
  snapshot: AnalysisSnapshot
  eligibilityInput: EligibilityInput
}

export async function loadCaseContext(q: Queryable, caseId: string, workspaceId: string): Promise<CaseContext | null> {
  const { rows } = await q.query<{ id: string; booking_id: string }>(
    'SELECT id, booking_id FROM recovery_cases WHERE id = $1 AND workspace_id = $2',
    [caseId, workspaceId],
  )
  if (!rows[0]) return null
  const facts = await loadBookingFacts(q, rows[0].booking_id)
  const { rows: p } = await q.query<{ id: string; version: string; body: string; content_hash: string }>(
    'SELECT id, version, body, content_hash FROM merchant_policies WHERE id = $1',
    [facts.booking.policy_id],
  )
  const policy = p[0]
  const { booking: b, capture: c, operation: o } = facts

  const snapshot: AnalysisSnapshot = {
    caseId,
    booking: {
      sourceId: `booking:${b.id}:revision:${b.revision}`,
      code: b.code,
      title: b.title,
      amount: centsToDecimal(b.amount_cents),
      currency: b.currency,
      payment_status: b.payment_state,
      fulfillment_status: b.fulfillment_state,
      fulfillment_reason: b.fulfillment_reason,
      merchant_confirmed: b.fulfillment_state === 'UNFULFILLABLE',
      simulated_failure: b.fulfillment_simulated,
    },
    policy: { sourceId: `policy:${policy.id}`, version: policy.version, text: policy.body },
    payment: c
      ? {
          sourceId: `capture:${c.provider_capture_id}`,
          status: c.provider_status,
          amount: centsToDecimal(c.amount_cents),
          currency: c.currency,
          payee_matches_configured_merchant: c.payee_merchant_id === expectedMerchantId(),
        }
      : null,
    operation: o ? { sourceId: `operation:${o.id}`, state: o.state } : null,
    untrustedCustomerNotes: { label: 'UNTRUSTED_CUSTOMER_DATA', notes: [] },
  }

  const eligibilityInput: EligibilityInput = {
    booking: { id: b.id, revision: b.revision, fulfillmentState: b.fulfillment_state, amountCents: b.amount_cents, currency: b.currency },
    capture: c
      ? {
          id: c.id,
          providerCaptureId: c.provider_capture_id,
          providerStatus: c.provider_status,
          amountCents: c.amount_cents,
          currency: c.currency,
          payeeMerchantId: c.payee_merchant_id,
        }
      : null,
    policy: { id: policy.id, contentHash: policy.content_hash },
    approvedPolicyId: POLICY_ID,
    expectedMerchantId: expectedMerchantId(),
    existingOperationState: o?.state ?? null,
  }

  return { caseId, workspaceId, facts, policy, snapshot, eligibilityInput }
}
