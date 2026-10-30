import { expectedMerchantId } from '@/lib/config'
import { getDb, json, type Database } from '@/lib/db/client'
import { audit } from '@/lib/domain/audit'
import {
  canReplay,
  MAX_READS,
  nextPollDelayMs,
  reduceRefundObservation,
  unknownBackoffMs,
} from '@/lib/domain/refund-reducer'
import { writeReceipt } from '@/lib/domain/receipts'
import type { CaptureRow, OperationRow } from '@/lib/domain/truth'
import { amountMatches } from '@/lib/money'
import {
  getProvider,
  ProviderRejected,
  ProviderRetryable,
  ProviderUnknownOutcome,
  refundWithFaults,
  type PayPalRefund,
} from '@/lib/paypal'
import type { JobResult } from './types'

// Worker sequence from PDF section 14, line for line.

type Ctx = { db: Database; op: OperationRow; capture: CaptureRow; bookingId: string }

async function loadCtx(db: Database, operationId: string): Promise<Ctx | null> {
  const { rows: ops } = await db.query<OperationRow>('SELECT * FROM money_operations WHERE id = $1', [operationId])
  const op = ops[0]
  if (!op) return null
  const { rows: caps } = await db.query<CaptureRow>('SELECT * FROM captures WHERE id = $1', [op.capture_id])
  return { db, op, capture: caps[0], bookingId: caps[0].booking_id }
}

async function setOp(ctx: Ctx, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields)
  const sets = keys.map((k, i) => `${k} = $${i + 2}${k === 'last_error' ? '::jsonb' : ''}`).join(', ')
  const values = keys.map((k) => (k === 'last_error' ? json(fields[k]) : fields[k]))
  await ctx.db.query(`UPDATE money_operations SET ${sets}, updated_at = now() WHERE id = $1`, [ctx.op.id, ...values])
}

async function event(ctx: Ctx, type: string, source: 'PAYPAL' | 'SYSTEM', summary: string, caseState?: string) {
  await ctx.db.tx(async (tx) => {
    if (caseState) {
      await tx.query('UPDATE recovery_cases SET state = $2, updated_at = now() WHERE id = $1', [ctx.op.case_id, caseState])
    }
    await audit(tx, { workspaceId: ctx.op.workspace_id, bookingId: ctx.bookingId, caseId: ctx.op.case_id, type, source, summary })
  })
}

async function toReview(ctx: Ctx, state: 'REJECTED' | 'MANUAL_REVIEW', reason: string): Promise<JobResult> {
  await ctx.db.tx(async (tx) => {
    await tx.query(
      'UPDATE money_operations SET state = $2, review_reason = $3, updated_at = now() WHERE id = $1',
      [ctx.op.id, state, reason],
    )
    await tx.query(
      "UPDATE recovery_cases SET state = 'REVIEW_REQUIRED', review_reason = $2, updated_at = now() WHERE id = $1",
      [ctx.op.case_id, reason],
    )
    await audit(tx, {
      workspaceId: ctx.op.workspace_id,
      bookingId: ctx.bookingId,
      caseId: ctx.op.case_id,
      type: state === 'REJECTED' ? 'REFUND_REJECTED' : 'REFUND_NEEDS_REVIEW',
      source: 'SYSTEM',
      summary: `Refund requires review: ${reason}. No new refund intent will be created.`,
    })
  })
  return { done: true }
}

/** Reduce once; close the case; write the immutable receipt. */
async function finalizeSuccess(ctx: Ctx, refund: PayPalRefund): Promise<JobResult> {
  await ctx.db.tx(async (tx) => {
    const { rows } = await tx.query<OperationRow>(
      `UPDATE money_operations SET state = 'SUCCEEDED', provider_status = $2, verified_at = COALESCE(verified_at, now()), updated_at = now()
       WHERE id = $1 AND state <> 'SUCCEEDED' RETURNING *`,
      [ctx.op.id, refund.status],
    )
    if (!rows[0]) return
    await tx.query("UPDATE recovery_cases SET state = 'RESOLVED_REFUNDED', review_reason = NULL, updated_at = now() WHERE id = $1", [ctx.op.case_id])
    await tx.query(
      "UPDATE bookings SET fulfillment_state = 'CLOSED', revision = revision + 1, updated_at = now() WHERE id = $1",
      [ctx.bookingId],
    )
    const { rows: pol } = await tx.query<{ version: string }>(
      'SELECT p.version FROM merchant_policies p JOIN bookings b ON b.policy_id = p.id WHERE b.id = $1',
      [ctx.bookingId],
    )
    await writeReceipt(tx, {
      workspaceId: ctx.op.workspace_id,
      caseId: ctx.op.case_id,
      capture: ctx.capture,
      operation: rows[0],
      policyVersion: pol[0]?.version ?? 'v1',
    })
    await audit(tx, {
      workspaceId: ctx.op.workspace_id,
      bookingId: ctx.bookingId,
      caseId: ctx.op.case_id,
      type: 'REFUND_CONFIRMED',
      source: 'PAYPAL',
      summary: `Refund ${refund.id} verified COMPLETED by direct read with matching amount, currency, and invoice.`,
    })
  })
  return { done: true }
}

async function observeRefund(ctx: Ctx, refundId: string): Promise<JobResult> {
  let refund: PayPalRefund
  try {
    refund = await getProvider().getRefund(refundId)
  } catch (err) {
    if (err instanceof ProviderRejected) return toReview(ctx, 'MANUAL_REVIEW', `REFUND_READ_${err.issue}`)
    return { retryInMs: err instanceof ProviderRetryable && err.retryAfterMs ? err.retryAfterMs : 5_000, note: (err as Error).message }
  }
  const readAttempts = ctx.op.read_attempts + 1
  await setOp(ctx, { read_attempts: readAttempts, provider_status: refund.status })

  const reduced = reduceRefundObservation({ id: ctx.op.id, amountCents: ctx.op.amount_cents, currency: ctx.op.currency }, refund)
  switch (reduced.state) {
    case 'SUCCEEDED':
      return finalizeSuccess(ctx, refund)
    case 'PROVIDER_PENDING':
      if (ctx.op.state !== 'PROVIDER_PENDING') {
        await setOp(ctx, { state: 'PROVIDER_PENDING' })
        await event(ctx, 'REFUND_PENDING', 'PAYPAL', `PayPal reports refund ${refund.id} as PENDING. Polling the refund ID.`, 'VERIFYING')
      }
      if (readAttempts >= MAX_READS) return toReview(ctx, 'MANUAL_REVIEW', 'REFUND_PENDING_TOO_LONG')
      return { retryInMs: nextPollDelayMs(readAttempts) }
    case 'REJECTED':
      return toReview(ctx, 'REJECTED', reduced.reason)
    case 'MANUAL_REVIEW':
      return toReview(ctx, 'MANUAL_REVIEW', reduced.reason)
  }
}

/** Adopt a refund ID only from a verified, correlated webhook (C.9). */
async function adoptFromWebhook(ctx: Ctx): Promise<string | null> {
  const { rows } = await ctx.db.query<{ resource_id: string }>(
    `SELECT resource_id FROM webhook_events
     WHERE correlated_ref = $1 AND verification_status = 'VERIFIED' AND resource_id IS NOT NULL
     ORDER BY received_at DESC LIMIT 1`,
    [`operation:${ctx.op.id}`],
  )
  const refundId = rows[0]?.resource_id
  if (!refundId) return null
  await ctx.db.query(
    'UPDATE money_operations SET provider_refund_id = $2, updated_at = now() WHERE id = $1 AND provider_refund_id IS NULL',
    [ctx.op.id, refundId],
  )
  return refundId
}

async function send(ctx: Ctx): Promise<JobResult> {
  let refund: PayPalRefund
  try {
    // POST same target + same request ID + same immutable body.
    refund = await refundWithFaults(ctx.op.case_id, ctx.capture.provider_capture_id, ctx.op.request_id, ctx.op.payload)
  } catch (err) {
    // C.3: a concurrent duplicate of the same request ID is ambiguous, not a rejection.
    const concurrentDuplicate =
      err instanceof ProviderRejected && (err.status === 409 || /PREVIOUS_REQUEST_IN_PROGRESS|CONCURRENT/i.test(err.issue))
    if (err instanceof ProviderUnknownOutcome || concurrentDuplicate) {
      const firstUnknown = ctx.op.state !== 'UNKNOWN'
      await setOp(ctx, { state: 'UNKNOWN', last_error: { message: (err as Error).message } })
      if (firstUnknown) {
        await event(ctx, 'REFUND_OUTCOME_UNKNOWN', 'SYSTEM', 'Refund outcome unknown. Reconciling with the same request ID; no new refund intent.', 'VERIFYING')
      }
      return { retryInMs: unknownBackoffMs(ctx.op.send_attempts) }
    }
    if (err instanceof ProviderRejected) {
      await setOp(ctx, { provider_debug_id: err.debugId ?? null })
      return toReview(ctx, 'REJECTED', `PAYPAL_${err.issue}`)
    }
    throw err
  }
  // Persist the refund ID and observed status, then verify by direct read.
  await setOp(ctx, { provider_refund_id: refund.id, provider_status: refund.status })
  await event(ctx, 'REFUND_ACCEPTED', 'PAYPAL', `PayPal accepted refund ${refund.id} (status ${refund.status}). Verifying by direct read.`)
  return observeRefund({ ...ctx, op: { ...ctx.op, provider_refund_id: refund.id } }, refund.id)
}

export async function runRefundJob(operationId: string): Promise<JobResult> {
  const db = await getDb()
  const ctx = await loadCtx(db, operationId)
  if (!ctx) return { done: true }
  const { op } = ctx

  if (op.state === 'SUCCEEDED') return { done: true }
  if (op.provider_refund_id) return observeRefund(ctx, op.provider_refund_id)
  if (op.state === 'REJECTED' || op.state === 'MANUAL_REVIEW') return { done: true }

  if (op.state === 'SENDING' || op.state === 'UNKNOWN') {
    const adopted = await adoptFromWebhook(ctx)
    if (adopted) return observeRefund(ctx, adopted)
    if (!canReplay({ sendAttempts: op.send_attempts, replayDeadline: op.replay_deadline ? new Date(op.replay_deadline) : null })) {
      return toReview(ctx, 'MANUAL_REVIEW', 'REPLAY_WINDOW_EXHAUSTED_OUTCOME_UNKNOWN')
    }
    await setOp(ctx, { send_attempts: op.send_attempts + 1 })
    return send({ ...ctx, op: { ...op, send_attempts: op.send_attempts + 1 } })
  }

  // QUEUED: re-fetch capture and revalidate all plan preconditions before the first write.
  let live
  try {
    live = await getProvider().getCapture(ctx.capture.provider_capture_id)
  } catch (err) {
    if (err instanceof ProviderRejected) return toReview(ctx, 'MANUAL_REVIEW', `CAPTURE_READ_${err.issue}`)
    return { retryInMs: 5_000, note: (err as Error).message }
  }
  const liveOk =
    live.status === 'COMPLETED' &&
    amountMatches(live.amount.value, op.amount_cents) &&
    live.amount.currency_code === op.currency &&
    live.payee?.merchant_id === expectedMerchantId()
  if (!liveOk) return toReview(ctx, 'MANUAL_REVIEW', `LIVE_CAPTURE_MISMATCH_${live.status}`)

  const { rows } = await db.query<OperationRow>(
    `UPDATE money_operations SET state = 'SENDING', send_attempts = send_attempts + 1,
       first_sent_at = COALESCE(first_sent_at, now()),
       replay_deadline = COALESCE(replay_deadline, now() + interval '5 minutes'), updated_at = now()
     WHERE id = $1 AND state = 'QUEUED' RETURNING *`,
    [op.id],
  )
  if (!rows[0]) return { retryInMs: 0 }
  await event({ ...ctx, op: rows[0] }, 'REFUND_SENDING', 'SYSTEM', 'Sending the persisted refund request to PayPal.')
  return send({ ...ctx, op: rows[0] })
}
