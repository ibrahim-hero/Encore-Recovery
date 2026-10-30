import { amountMatches } from '@/lib/money'

// Pure reducers for the full-refund operation (PDF sections 11 and 14).

export const MAX_AMBIGUOUS_WRITES = 5
export const REPLAY_WINDOW_MS = 5 * 60_000
export const MAX_READS = 50

export type RefundObservation = { status: string; amount?: { value: string; currency_code: string }; invoice_id?: string }

export type Reduced =
  | { state: 'SUCCEEDED' }
  | { state: 'PROVIDER_PENDING' }
  | { state: 'REJECTED'; reason: string }
  | { state: 'MANUAL_REVIEW'; reason: string }

/** Completion only from a verified COMPLETED read with matching amount, currency, and invoice (INV-03, INV-09). */
export function reduceRefundObservation(
  op: { id: string; amountCents: number; currency: string },
  refund: RefundObservation,
): Reduced {
  switch (refund.status) {
    case 'COMPLETED': {
      const ok =
        amountMatches(refund.amount?.value, op.amountCents) &&
        refund.amount?.currency_code === op.currency &&
        refund.invoice_id === `ER-${op.id}`
      return ok ? { state: 'SUCCEEDED' } : { state: 'MANUAL_REVIEW', reason: 'COMPLETED_REFUND_DOES_NOT_MATCH_OPERATION' }
    }
    case 'PENDING':
      return { state: 'PROVIDER_PENDING' }
    case 'FAILED':
    case 'CANCELLED':
      return { state: 'REJECTED', reason: `PROVIDER_STATUS_${refund.status}` }
    default:
      // INV-14: unrecognised status preserved and routed to review.
      return { state: 'MANUAL_REVIEW', reason: `UNRECOGNIZED_PROVIDER_STATUS:${refund.status}` }
  }
}

/** Read polling schedule for PROVIDER_PENDING (addendum C.4). */
export function nextPollDelayMs(readAttempts: number): number {
  return [5_000, 15_000, 60_000][readAttempts - 1] ?? 300_000
}

/** Bounded backoff between same-key replays after an ambiguous write. */
export function unknownBackoffMs(sendAttempts: number): number {
  return [2_000, 5_000, 15_000, 30_000, 60_000][sendAttempts - 1] ?? 60_000
}

export function canReplay(op: { sendAttempts: number; replayDeadline: Date | null }, now = new Date()): boolean {
  return !!op.replayDeadline && now < op.replayDeadline && op.sendAttempts < MAX_AMBIGUOUS_WRITES
}
