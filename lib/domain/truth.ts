import { expectedMerchantId, isSandbox } from '@/lib/config'
import type { Queryable } from '@/lib/db/client'
import { formatMoney } from '@/lib/money'
import { fmtTime } from '@/lib/time'
import type { FactSnapshot, TruthFact } from '@/lib/view-types'

export type BookingRow = {
  id: string
  workspace_id: string
  code: string
  title: string
  amount_cents: number
  currency: string
  policy_id: string
  payment_state: string
  fulfillment_state: string
  fulfillment_reason: string | null
  fulfillment_simulated: boolean
  fulfillment_confirmed_at: Date | null
  revision: number
  created_at: Date
  updated_at: Date
}

export type CaptureRow = {
  id: string
  booking_id: string
  payment_order_id: string
  provider_capture_id: string
  provider_order_id: string
  amount_cents: number
  currency: string
  provider_status: string
  payee_merchant_id: string | null
  verified_at: Date | null
  observed_at: Date
}

export type OperationRow = {
  id: string
  workspace_id: string
  case_id: string
  capture_id: string
  plan_id: string
  request_id: string
  payload: { amount: { currency_code: string; value: string }; invoice_id: string; note_to_payer: string }
  amount_cents: number
  currency: string
  state: string
  provider_refund_id: string | null
  provider_status: string | null
  provider_debug_id: string | null
  send_attempts: number
  read_attempts: number
  first_sent_at: Date | null
  replay_deadline: Date | null
  last_error: unknown
  review_reason: string | null
  verified_at: Date | null
  updated_at: Date
}

export type BookingFacts = {
  booking: BookingRow
  capture: CaptureRow | null
  operation: OperationRow | null
}

export async function loadBookingFacts(q: Queryable, bookingId: string): Promise<BookingFacts> {
  const { rows: b } = await q.query<BookingRow>('SELECT * FROM bookings WHERE id = $1', [bookingId])
  if (!b[0]) throw new Error(`Booking ${bookingId} not found`)
  const { rows: c } = await q.query<CaptureRow>('SELECT * FROM captures WHERE booking_id = $1', [bookingId])
  const capture = c[0] ?? null
  let operation: OperationRow | null = null
  if (capture) {
    const { rows: o } = await q.query<OperationRow>(
      "SELECT * FROM money_operations WHERE capture_id = $1 AND kind = 'FULL_REFUND'",
      [capture.id],
    )
    operation = o[0] ?? null
  }
  return { booking: b[0], capture, operation }
}

const PAYMENT_LABEL: Record<string, { value: string; tone: TruthFact['tone'] }> = {
  NOT_STARTED: { value: 'Awaiting payment', tone: 'neutral' },
  AWAITING_BUYER: { value: 'Awaiting buyer', tone: 'attention' },
  CAPTURING: { value: 'Capturing', tone: 'attention' },
  UNKNOWN: { value: 'Payment unknown', tone: 'attention' },
  PENDING: { value: 'Payment pending', tone: 'attention' },
  COMPLETED: { value: 'Paid', tone: 'confirmed' },
  FAILED: { value: 'Payment failed', tone: 'failure' },
  REVIEW_REQUIRED: { value: 'Needs review', tone: 'failure' },
}

export function buildTruth(f: BookingFacts) {
  const { booking, capture, operation } = f
  const money = formatMoney(booking.amount_cents, booking.currency)
  const providerLabel = isSandbox() ? 'PayPal Sandbox' : 'Fixture PayPal'
  const pay = PAYMENT_LABEL[booking.payment_state] ?? { value: booking.payment_state, tone: 'failure' as const }

  const bookingFact: TruthFact = {
    source: 'BOOKING',
    authority: 'Encore booking record',
    value: pay.value,
    detail: `${booking.code} · ${booking.title} · ${money}`,
    observedAt: fmtTime(booking.updated_at),
    tone: pay.tone,
    resourceId: `booking:${booking.id}:revision:${booking.revision}`,
    facts: [
      { label: 'Booking', value: booking.code },
      { label: 'Amount', value: `${money} ${booking.currency}` },
      { label: 'Payment state', value: booking.payment_state },
      { label: 'Revision', value: String(booking.revision) },
    ],
  }

  const fulfillmentFact: TruthFact = (() => {
    const base = {
      source: 'FULFILLMENT' as const,
      authority: 'Merchant fulfillment record',
      resourceId: `booking:${booking.id}:fulfillment`,
      observedAt: fmtTime(booking.fulfillment_confirmed_at ?? booking.updated_at),
    }
    if (booking.fulfillment_state === 'UNFULFILLABLE') {
      return {
        ...base,
        value: 'Cannot fulfill',
        tone: 'failure' as const,
        detail: `${booking.fulfillment_reason ?? 'Merchant confirmed it cannot provide this booking.'}${booking.fulfillment_simulated ? ' (simulated merchant failure)' : ''}`,
        facts: [
          { label: 'Status', value: 'UNFULFILLABLE' },
          { label: 'Confirmed by', value: 'Merchant' },
          { label: 'Simulated', value: booking.fulfillment_simulated ? 'Yes — labeled demo failure' : 'No' },
        ],
      }
    }
    if (booking.fulfillment_state === 'CLOSED') {
      return {
        ...base,
        value: 'Closed',
        tone: 'confirmed' as const,
        detail: 'Booking closed after a verified refund.',
        facts: [{ label: 'Status', value: 'CLOSED' }],
      }
    }
    return {
      ...base,
      value: 'Scheduled',
      tone: 'neutral' as const,
      detail: 'Merchant has not reported a fulfillment problem.',
      facts: [{ label: 'Status', value: 'SCHEDULED' }],
    }
  })()

  const paypalFact: TruthFact = (() => {
    const base = { source: 'PAYPAL' as const, authority: providerLabel }
    if (!capture) {
      return {
        ...base,
        value: 'No capture',
        tone: 'neutral' as const,
        detail: 'No verified capture is recorded for this booking.',
        observedAt: fmtTime(booking.updated_at),
        resourceId: `booking:${booking.id}:payment`,
        facts: [],
      }
    }
    const captureFacts = [
      { label: 'Capture ID', value: capture.provider_capture_id },
      { label: 'Order ID', value: capture.provider_order_id },
      { label: 'Capture status', value: capture.provider_status },
      { label: 'Captured', value: `${formatMoney(capture.amount_cents, capture.currency)} ${capture.currency}` },
      { label: 'Payee matches', value: capture.payee_merchant_id === expectedMerchantId() ? 'Yes' : 'No' },
    ]
    const opFacts = operation
      ? [
          { label: 'Refund operation', value: operation.state },
          { label: 'Refund ID', value: operation.provider_refund_id ?? 'Not yet known' },
          { label: 'Refund provider status', value: operation.provider_status ?? '—' },
        ]
      : []
    const facts = [...captureFacts, ...opFacts]
    const observedAt = fmtTime(operation?.verified_at ?? operation?.updated_at ?? capture.observed_at)
    const resourceId = `capture:${capture.provider_capture_id}`

    if (operation?.state === 'SUCCEEDED') {
      return { ...base, value: `Refunded ${formatMoney(operation.amount_cents, operation.currency)}`, tone: 'confirmed' as const, detail: `Refund ${operation.provider_refund_id} confirmed COMPLETED by direct read.`, observedAt, resourceId, facts }
    }
    if (operation?.state === 'PROVIDER_PENDING') {
      return { ...base, value: 'Refund pending', tone: 'attention' as const, detail: `PayPal reports refund ${operation.provider_refund_id} as PENDING.`, observedAt, resourceId, facts }
    }
    if (operation?.state === 'UNKNOWN' || operation?.state === 'SENDING') {
      return { ...base, value: operation.state === 'UNKNOWN' ? 'Refund outcome unknown' : 'Refund sending', tone: 'attention' as const, detail: 'The refund outcome is not yet known. Reconciling with the same request ID.', observedAt, resourceId, facts }
    }
    if (operation?.state === 'REJECTED' || operation?.state === 'MANUAL_REVIEW') {
      return { ...base, value: operation.state === 'REJECTED' ? 'Refund rejected' : 'Needs review', tone: 'failure' as const, detail: operation.review_reason ?? 'Provider outcome requires manual review.', observedAt, resourceId, facts }
    }
    if (capture.provider_status === 'COMPLETED') {
      return { ...base, value: `Captured ${formatMoney(capture.amount_cents, capture.currency)}`, tone: 'confirmed' as const, detail: 'Capture verified COMPLETED with matching amount, currency, and payee.', observedAt, resourceId, facts }
    }
    return { ...base, value: `Capture ${capture.provider_status.toLowerCase()}`, tone: 'attention' as const, detail: 'Capture is not completed.', observedAt, resourceId, facts }
  })()

  // The broken segment marks the actual disagreement (plan section 19).
  const moneyStillHeld = capture?.provider_status === 'COMPLETED' && operation?.state !== 'SUCCEEDED'
  let brokenSegment: 0 | 1 | null = null
  let mismatch: { headline: string; body: string } | null = null
  if (booking.fulfillment_state === 'UNFULFILLABLE' && moneyStillHeld) {
    brokenSegment = 1
    mismatch = {
      headline: `Customer charged ${money}; booking cannot be fulfilled`,
      body: 'The merchant confirmed it cannot provide this booking, but the verified capture has not been refunded.',
    }
  } else if (booking.payment_state === 'UNKNOWN' || booking.payment_state === 'REVIEW_REQUIRED') {
    brokenSegment = 0
    mismatch = { headline: 'Payment state is uncertain', body: 'Encore cannot confirm the capture. Reconcile before any recovery action.' }
  }

  return { booking: bookingFact, fulfillment: fulfillmentFact, paypal: paypalFact, brokenSegment, mismatch }
}

export function toSnapshot(t: ReturnType<typeof buildTruth>) {
  const pick = (f: TruthFact): FactSnapshot => ({ value: f.value, detail: f.detail, tone: f.tone })
  return { booking: pick(t.booking), fulfillment: pick(t.fulfillment), paypal: pick(t.paypal) }
}
