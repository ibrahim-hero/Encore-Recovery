import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DiagnosisGenerator } from '@/lib/ai/adapter'
import { getDb, resetDbForTests } from '@/lib/db/client'
import { requestAnalysis, runAnalysis } from '@/lib/domain/analysis'
import { completeCapture, createSampleBooking, simulateMerchantFailure, startCheckout } from '@/lib/domain/bookings'
import { armFault, executePlan } from '@/lib/domain/execute'
import { getCaseView } from '@/lib/domain/projections'
import { createSession } from '@/lib/domain/session'
import { handlePayPalWebhook } from '@/lib/domain/webhooks'
import { sha256 } from '@/lib/crypto'
import { drainJobs } from '@/lib/jobs/drain'
import { fakeProvider } from '@/lib/paypal/fake'

const ORIGIN = 'http://localhost:3000'

// Deterministic stand-in for the model; A-series tests cover the real contract.
const proposeRefund: DiagnosisGenerator = async (s) => ({
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

async function paidBooking(workspaceId: string) {
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

async function caseWithPlan(workspaceId: string) {
  const { bookingId } = await paidBooking(workspaceId)
  const { caseId } = await simulateMerchantFailure(workspaceId, bookingId, 'Venue closed unexpectedly')
  const { analysisId } = await requestAnalysis(workspaceId, caseId)
  await runAnalysis(analysisId, proposeRefund)
  const view = await getCaseView(workspaceId, caseId)
  return { bookingId, caseId, view }
}

async function drainUntilIdle(workspaceId: string, rounds = 10) {
  const db = await getDb()
  for (let i = 0; i < rounds; i++) {
    await db.query("UPDATE outbox_jobs SET available_at = now() WHERE state = 'READY'")
    const n = await drainJobs({ workspaceId, max: 10 })
    if (n === 0) return
  }
}

async function fixtureRefundCount(): Promise<number> {
  const db = await getDb()
  const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM fixture_provider_objects WHERE kind = 'refund'")
  return rows[0].n
}

describe('money path on embedded Postgres + fixture provider', () => {
  let ws: string
  let other: string

  beforeAll(async () => {
    await resetDbForTests()
    ws = (await createSession()).ctx.workspaceId
    other = (await createSession()).ctx.workspaceId
  })
  afterAll(() => resetDbForTests())

  it('migrations + seed are idempotent (T02)', async () => {
    const db = await getDb()
    const { runMigrations } = await import('@/lib/db/migrate')
    const { seed } = await import('@/lib/db/seed')
    expect(await runMigrations(db)).toEqual([])
    await seed(db)
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM booking_templates')
    expect(rows[0].n).toBe(3)
  })

  it('I01-I04 checkout, capture, independent verification, idempotent return', async () => {
    const { bookingId, token, nonce, captured } = await paidBooking(ws)
    expect(captured.state).toBe('COMPLETED')
    // Second return (reload) is idempotent.
    expect((await completeCapture(ws, bookingId, { orderToken: token, returnNonce: nonce })).state).toBe('COMPLETED')
    // Wrong nonce is rejected.
    await expect(completeCapture(ws, bookingId, { orderToken: token, returnNonce: 'forged' })).rejects.toMatchObject({ code: 'RETURN_NONCE_INVALID' })
  })

  it('happy path: plan -> execute -> verified refund -> receipt; execute is idempotent (I07)', async () => {
    const { caseId, view } = await caseWithPlan(ws)
    expect(view.caseState).toBe('READY')
    expect(view.preview?.amountCents).toBe(5400)
    expect(view.preview?.actionLabel).toBe('Issue fixture refund - $54.00')

    const before = await fixtureRefundCount()
    const first = await executePlan(ws, view.preview!.planId)
    const second = await executePlan(ws, view.preview!.planId)
    expect(second).toEqual({ operationId: first.operationId, existing: true })

    await drainUntilIdle(ws)
    const done = await getCaseView(ws, caseId)
    expect(done.caseState).toBe('RESOLVED_REFUNDED')
    expect(done.operation?.state).toBe('SUCCEEDED')
    expect(done.receipt?.refundCents).toBe(5400)
    expect(done.receipt?.remainingCents).toBe(0)
    expect(done.receipt?.verifiedAgainst).toContain('fixture')
    expect(await fixtureRefundCount()).toBe(before + 1)
  })

  it('I08/I10 dropped refund response -> UNKNOWN -> same-key replay -> exactly one refund', async () => {
    const { caseId, view } = await caseWithPlan(ws)
    await armFault(ws, caseId)
    const before = await fixtureRefundCount()
    await executePlan(ws, view.preview!.planId)

    // One pass: the refund job sends, loses the response, and reschedules with backoff.
    await drainJobs({ workspaceId: ws, max: 10 })
    const unknown = await getCaseView(ws, caseId)
    expect(unknown.operation?.state).toBe('UNKNOWN')
    expect(unknown.fault.triggered).toBe(true)
    expect(await fixtureRefundCount()).toBe(before + 1)

    await drainUntilIdle(ws)
    const done = await getCaseView(ws, caseId)
    expect(done.operation?.state).toBe('SUCCEEDED')
    expect(done.operation?.sendAttempts).toBe(2)
    expect(await fixtureRefundCount()).toBe(before + 1)

    const db = await getDb()
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM money_operations WHERE case_id = $1', [caseId])
    expect(rows[0].n).toBe(1)
  })

  it('S01 cross-workspace access returns 404 and creates nothing', async () => {
    const { caseId, view } = await caseWithPlan(ws)
    await expect(getCaseView(other, caseId)).rejects.toMatchObject({ status: 404 })
    await expect(executePlan(other, view.preview!.planId)).rejects.toMatchObject({ status: 404 })
    const db = await getDb()
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM money_operations WHERE case_id = $1', [caseId])
    expect(rows[0].n).toBe(0)
  })

  it('stale plan is rejected when facts change (INV-07)', async () => {
    const { bookingId, view } = await caseWithPlan(ws)
    const db = await getDb()
    await db.query('UPDATE bookings SET revision = revision + 1 WHERE id = $1', [bookingId])
    await expect(executePlan(ws, view.preview!.planId)).rejects.toMatchObject({ code: 'PLAN_STALE' })
  })

  it('rules override an AI refund proposal without a verified capture (INV-02/INV-08)', async () => {
    const { bookingId } = await createSampleBooking(ws, 'gallery-tour-18')
    const { caseId } = await simulateMerchantFailure(ws, bookingId, 'Guide unavailable')
    const { analysisId } = await requestAnalysis(ws, caseId)
    await runAnalysis(analysisId, proposeRefund)
    const view = await getCaseView(ws, caseId)
    expect(view.preview).toBeNull()
    expect(view.caseState).toBe('OPEN')
    expect(view.reviewReason).toContain('NO_VERIFIED_CAPTURE')
  })

  it('failed model call leaves a visible error and no plan', async () => {
    const { bookingId } = await paidBooking(ws)
    const { caseId } = await simulateMerchantFailure(ws, bookingId, 'Presenter ill')
    const { analysisId } = await requestAnalysis(ws, caseId)
    await runAnalysis(analysisId, async () => {
      throw new Error('gateway down')
    })
    const view = await getCaseView(ws, caseId)
    expect(view.analysis?.state).toBe('FAILED')
    expect(view.preview).toBeNull()
    expect(view.can.analyze).toBe(true)
  })

  it('I15-I19 webhooks: unsigned rejected, duplicates ignored, unmapped stored, mapped bumps job', async () => {
    const body = (id: string, invoice: string) =>
      JSON.stringify({ id, event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'R-X', invoice_id: invoice, status: 'COMPLETED' } })
    const signed = (raw: string) => new Headers({ 'paypal-transmission-sig': sha256(`fixture:${raw}`) })

    const unsigned = body('WH-1', 'ER-nope')
    expect((await handlePayPalWebhook(new Headers(), unsigned)).result).toBe('REJECTED_SIGNATURE')

    const unmapped = body('WH-2', 'ER-00000000-0000-0000-0000-000000000000')
    expect((await handlePayPalWebhook(signed(unmapped), unmapped)).result).toBe('UNMAPPED')
    expect((await handlePayPalWebhook(signed(unmapped), unmapped)).result).toBe('DUPLICATE')

    const db = await getDb()
    const { rows } = await db.query<{ id: string }>("SELECT id FROM money_operations WHERE state = 'SUCCEEDED' LIMIT 1")
    const mapped = body('WH-3', `ER-${rows[0].id}`)
    expect((await handlePayPalWebhook(signed(mapped), mapped)).result).toBe('MAPPED')
  })
})
