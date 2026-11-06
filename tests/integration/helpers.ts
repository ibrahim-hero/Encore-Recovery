import type { DiagnosisGenerator } from '@/lib/ai/adapter'
import { sha256 } from '@/lib/crypto'
import { getDb } from '@/lib/db/client'
import { requestAnalysis, runAnalysis } from '@/lib/domain/analysis'
import { completeCapture, createSampleBooking, simulateMerchantFailure, startCheckout } from '@/lib/domain/bookings'
import { getCaseView } from '@/lib/domain/projections'
import { drainJobs } from '@/lib/jobs/drain'
import { fakeProvider } from '@/lib/paypal/fake'

export const ORIGIN = 'http://localhost:3000'

export const proposeRefund: DiagnosisGenerator = async (s) => ({
  model: 'test/stub',
  repaired: false,
  diagnosis: {
    disposition: 'PROPOSE_FULL_REFUND',
    reasonCodes: ['MERCHANT_CONFIRMED_UNFULFILLABLE'],
    summary: 'Merchant confirmed it cannot provide the booking and a matching completed capture exists.',
    evidence: [
      { sourceId: s.booking.sourceId, field: 'fulfillment_status' },
      { sourceId: s.policy.sourceId, field: 'text' },
      ...(s.payment ? [{ sourceId: s.payment.sourceId, field: 'status' }] : []),
    ],
    missingInformation: [],
    customerMessageDraft: 'We cannot provide your booked service and have refunded you.',
  },
})

export async function paidBooking(workspaceId: string) {
  const db = await getDb()
  const { bookingId } = await createSampleBooking(workspaceId, 'community-presentation-54')
  const { approveUrl } = await startCheckout(workspaceId, bookingId, ORIGIN)
  const token = new URL(approveUrl).searchParams.get('token')!
  const { rows } = await db.query<{ create_payload: { payment_source: { paypal: { experience_context: { return_url: string } } } } }>(
    'SELECT create_payload FROM payment_orders WHERE booking_id = $1',
    [bookingId],
  )
  const nonce = new URL(rows[0].create_payload.payment_source.paypal.experience_context.return_url).searchParams.get('n')!
  await fakeProvider.approveOrder(token)
  const captured = await completeCapture(workspaceId, bookingId, { orderToken: token, returnNonce: nonce })
  return { bookingId, token, nonce, captured }
}

export async function caseWithPlan(workspaceId: string, generator: DiagnosisGenerator = proposeRefund) {
  const { bookingId } = await paidBooking(workspaceId)
  const { caseId } = await simulateMerchantFailure(workspaceId, bookingId, 'Venue closed unexpectedly')
  const { analysisId } = await requestAnalysis(workspaceId, caseId)
  await runAnalysis(analysisId, generator)
  const view = await getCaseView(workspaceId, caseId)
  return { bookingId, caseId, view }
}

export async function drainUntilIdle(workspaceId: string, rounds = 10) {
  const db = await getDb()
  for (let i = 0; i < rounds; i++) {
    await db.query("UPDATE outbox_jobs SET available_at = now() WHERE state = 'READY'")
    const n = await drainJobs({ workspaceId, max: 10 })
    if (n === 0) return
  }
}

export async function fixtureRefundCount(): Promise<number> {
  const db = await getDb()
  const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM fixture_provider_objects WHERE kind = 'refund'")
  return rows[0].n
}

export async function operationRow(caseId: string) {
  const db = await getDb()
  const { rows } = await db.query<{
    id: string
    state: string
    request_id: string
    payload: unknown
    capture_id: string
    send_attempts: number
    provider_refund_id: string | null
  }>('SELECT id, state, request_id, payload, capture_id, send_attempts, provider_refund_id FROM money_operations WHERE case_id = $1', [caseId])
  return rows[0]
}

/** Signed fixture webhook, the same way the fake provider verifies it. */
export function signedHeaders(raw: string): Headers {
  return new Headers({ 'paypal-transmission-sig': sha256(`fixture:${raw}`) })
}

export function refundWebhookBody(eventId: string, eventType: string, operationId: string, refundId: string): string {
  return JSON.stringify({
    id: eventId,
    event_type: eventType,
    resource: { id: refundId, invoice_id: `ER-${operationId}`, status: 'COMPLETED' },
  })
}

export async function latestFixtureRefundId(): Promise<string> {
  const db = await getDb()
  const { rows } = await db.query<{ id: string }>("SELECT id FROM fixture_provider_objects WHERE kind = 'refund' ORDER BY updated_at DESC LIMIT 1")
  return rows[0].id
}
