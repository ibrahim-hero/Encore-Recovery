import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST as createBookingRoute } from '@/app/api/bookings/route'
import { POST as executeRoute } from '@/app/api/recovery/plans/[id]/execute/route'
import { getDb, resetDbForTests } from '@/lib/db/client'
import { requestAnalysis, runAnalysis } from '@/lib/domain/analysis'
import { simulateMerchantFailure } from '@/lib/domain/bookings'
import { executePlan, armFault } from '@/lib/domain/execute'
import { getCaseView } from '@/lib/domain/projections'
import { createSession, requireSession, SESSION_COOKIE, CSRF_HEADER } from '@/lib/domain/session'
import { handlePayPalWebhook } from '@/lib/domain/webhooks'
import { drainJobs } from '@/lib/jobs/drain'
import { fakeProvider } from '@/lib/paypal/fake'
import {
  caseWithPlan,
  drainUntilIdle,
  fixtureRefundCount,
  latestFixtureRefundId,
  operationRow,
  ORIGIN,
  paidBooking,
  proposeRefund,
  refundWebhookBody,
  signedHeaders,
} from './helpers'

describe('interruptions and concurrency (I09, I11, I12, I16, I17)', () => {
  let ws: string

  beforeAll(async () => {
    await resetDbForTests()
    ws = (await createSession()).ctx.workspaceId
  })
  afterAll(() => resetDbForTests())

  it('I09 work committed with the queue transaction survives and runs after a restart', async () => {
    const { caseId, view } = await caseWithPlan(ws)
    const before = await fixtureRefundCount()
    const { operationId } = await executePlan(ws, view.preview!.planId)

    // "Crash": nothing has run. The job and the operation are already durable rows.
    const db = await getDb()
    const { rows: jobs } = await db.query<{ state: string }>("SELECT state FROM outbox_jobs WHERE dedupe_key = $1", [`refund:${operationId}`])
    expect(jobs).toEqual([{ state: 'READY' }])
    expect((await operationRow(caseId)).state).toBe('QUEUED')
    expect(await fixtureRefundCount()).toBe(before)

    // "Restart": a fresh drain picks the persisted job up with no in-memory state.
    await drainUntilIdle(ws)
    expect((await operationRow(caseId)).state).toBe('SUCCEEDED')
    expect(await fixtureRefundCount()).toBe(before + 1)
  })

  it('I11 provider commits the refund, the response is lost, and a verified event resolves it to one refund', async () => {
    const { caseId, view } = await caseWithPlan(ws)
    await armFault(ws, caseId)
    const before = await fixtureRefundCount()
    await executePlan(ws, view.preview!.planId)

    await drainJobs({ workspaceId: ws, max: 10 })
    const unknown = await getCaseView(ws, caseId)
    expect(unknown.operation?.state).toBe('UNKNOWN')
    expect(await fixtureRefundCount()).toBe(before + 1)

    const op = await operationRow(caseId)
    expect(op.provider_refund_id).toBeNull()
    const refundId = await latestFixtureRefundId()
    const raw = refundWebhookBody('WH-I11', 'PAYMENT.CAPTURE.REFUNDED', op.id, refundId)
    expect((await handlePayPalWebhook(signedHeaders(raw), raw)).result).toBe('MAPPED')

    await drainUntilIdle(ws)
    const done = await operationRow(caseId)
    expect(done.state).toBe('SUCCEEDED')
    expect(done.provider_refund_id).toBe(refundId)
    expect(done.send_attempts).toBe(1)
    expect(await fixtureRefundCount()).toBe(before + 1)
  })

  it('I12 a refund the database never recorded is found later with the same key: one refund, one financial entry', async () => {
    const { caseId, view } = await caseWithPlan(ws)
    const before = await fixtureRefundCount()
    await executePlan(ws, view.preview!.planId)
    const op = await operationRow(caseId)
    const db = await getDb()

    // The provider accepted the refund, then the database write that would record it failed.
    await db.query(
      `UPDATE money_operations SET state = 'SENDING', send_attempts = 1, first_sent_at = now(),
         replay_deadline = now() + interval '5 minutes' WHERE id = $1`,
      [op.id],
    )
    const { rows: caps } = await db.query<{ provider_capture_id: string }>('SELECT provider_capture_id FROM captures WHERE id = $1', [op.capture_id])
    const refund = await fakeProvider.refundCapture(caps[0].provider_capture_id, op.request_id, op.payload as never)
    expect(await fixtureRefundCount()).toBe(before + 1)

    await drainUntilIdle(ws)
    const done = await operationRow(caseId)
    expect(done.state).toBe('SUCCEEDED')
    expect(done.provider_refund_id).toBe(refund.id)
    expect(await fixtureRefundCount()).toBe(before + 1)

    const { rows: receipts } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM evidence_receipts WHERE case_id = $1', [caseId])
    expect(receipts[0].n).toBe(1)
    const { rows: ops } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM money_operations WHERE case_id = $1', [caseId])
    expect(ops[0].n).toBe(1)
  })

  it('I16 an old pending event after verified completion leaves the completed state intact', async () => {
    const { caseId, view } = await caseWithPlan(ws)
    await executePlan(ws, view.preview!.planId)
    await drainUntilIdle(ws)
    const op = await operationRow(caseId)
    expect(op.state).toBe('SUCCEEDED')
    const before = await fixtureRefundCount()

    const stale = refundWebhookBody('WH-I16', 'PAYMENT.REFUND.PENDING', op.id, op.provider_refund_id!)
    expect((await handlePayPalWebhook(signedHeaders(stale), stale)).result).toBe('MAPPED')
    await drainUntilIdle(ws)

    const after = await getCaseView(ws, caseId)
    expect(after.caseState).toBe('RESOLVED_REFUNDED')
    expect(after.operation?.state).toBe('SUCCEEDED')
    expect(after.receipt?.refundCents).toBe(5400)
    expect(await fixtureRefundCount()).toBe(before)
  })

  it('I17 an invalid webhook signature changes no domain or money state', async () => {
    const { caseId, view } = await caseWithPlan(ws)
    await executePlan(ws, view.preview!.planId)
    await drainUntilIdle(ws)
    const op = await operationRow(caseId)
    const db = await getDb()

    const snapshot = async () => ({
      operation: (await db.query('SELECT state, provider_status, provider_refund_id, send_attempts FROM money_operations WHERE id = $1', [op.id])).rows,
      cases: (await db.query('SELECT state FROM recovery_cases WHERE id = $1', [caseId])).rows,
      audit: (await db.query('SELECT count(*)::int AS n FROM audit_events WHERE case_id = $1', [caseId])).rows,
      jobs: (await db.query('SELECT state, available_at FROM outbox_jobs WHERE dedupe_key = $1', [`refund:${op.id}`])).rows,
      refunds: await fixtureRefundCount(),
    })
    const before = await snapshot()

    const raw = refundWebhookBody('WH-I17', 'PAYMENT.CAPTURE.REFUNDED', op.id, op.provider_refund_id!)
    const forged = new Headers({ 'paypal-transmission-sig': 'not-a-real-signature' })
    expect(await handlePayPalWebhook(forged, raw)).toEqual({ status: 400, result: 'REJECTED_SIGNATURE' })
    expect(await handlePayPalWebhook(new Headers(), raw)).toMatchObject({ status: 200, result: 'DUPLICATE' })

    expect(await snapshot()).toEqual(before)
    const { rows } = await db.query<{ verification_status: string; processing_result: string }>(
      "SELECT verification_status, processing_result FROM webhook_events WHERE provider_event_id = 'WH-I17'",
    )
    expect(rows).toEqual([{ verification_status: 'FAILED', processing_result: 'REJECTED_SIGNATURE' }])
  })

  it('U12 end to end: an invented source reference yields no executable plan', async () => {
    const { bookingId } = await paidBooking(ws)
    const { caseId } = await simulateMerchantFailure(ws, bookingId, 'Presenter ill')
    const { analysisId } = await requestAnalysis(ws, caseId)
    await runAnalysis(analysisId, async (s) => {
      const good = await proposeRefund(s)
      return { ...good, diagnosis: { ...good.diagnosis, evidence: [{ sourceId: 'capture:INVENTED', field: 'status' }] } }
    })
    const view = await getCaseView(ws, caseId)
    expect(view.preview).toBeNull()
    expect(view.analysis?.state).toBe('FAILED')
    expect(view.can.analyze).toBe(true)
  })
})

describe('request hardening (S02, S03)', () => {
  let token: string
  let csrf: string
  let ws: string

  const request = (init: { origin?: string | null; csrf?: string | null; body?: unknown; cookie?: boolean } = {}) => {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (init.cookie !== false) headers.set('cookie', `${SESSION_COOKIE}=${token}`)
    if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN)
    if (init.csrf !== null) headers.set(CSRF_HEADER, init.csrf ?? csrf)
    return new Request(`${ORIGIN}/api/test`, { method: 'POST', headers, body: JSON.stringify(init.body ?? {}) })
  }

  beforeAll(async () => {
    await resetDbForTests()
    const s = await createSession()
    token = s.token
    csrf = s.ctx.csrfToken
    ws = s.ctx.workspaceId
  })
  afterAll(() => resetDbForTests())

  it('S02 a mutation without a valid CSRF token or trusted Origin is rejected', async () => {
    await expect(requireSession(request(), { mutation: true })).resolves.toMatchObject({ workspaceId: ws })

    const bad = [
      request({ csrf: null }),
      request({ csrf: 'wrong-token' }),
      request({ origin: 'https://evil.example' }),
      request({ origin: null }),
      request({ cookie: false }),
    ]
    for (const req of bad) {
      await expect(requireSession(req, { mutation: true })).rejects.toBeTruthy()
    }
    // Reads need no CSRF header, so the mutation guard is what protects writes.
    await expect(requireSession(request({ csrf: null }), { mutation: false })).resolves.toMatchObject({ workspaceId: ws })
  })

  it('S02 rejected mutations queue no job and create no operation', async () => {
    const { view } = await caseWithPlan(ws)
    const db = await getDb()
    const jobsBefore = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM outbox_jobs')).rows[0].n

    const params = { params: Promise.resolve({ id: view.preview!.planId }) }
    for (const req of [request({ csrf: null }), request({ csrf: 'wrong' }), request({ origin: 'https://evil.example' })]) {
      const res = await executeRoute(req, params)
      expect(res.status).toBe(403)
    }
    const res = await executeRoute(request({ cookie: false }), params)
    expect(res.status).toBe(401)

    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM outbox_jobs')).rows[0].n).toBe(jobsBefore)
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM money_operations')).rows[0].n).toBe(0)
  })

  it('S03 client-supplied amount, recipient, or provider URL is rejected and changes nothing', async () => {
    const db = await getDb()
    const count = async () => (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM bookings WHERE workspace_id = $1', [ws])).rows[0].n
    const before = await count()

    for (const extra of [{ amountCents: 1 }, { amount: '0.01' }, { recipient: 'attacker@example.com' }, { approveUrl: 'https://evil.example/pay' }]) {
      const res = await createBookingRoute(request({ body: { template: 'community-presentation-54', ...extra } }))
      expect(res.status).toBe(400)
    }
    expect(await count()).toBe(before)

    const ok = await createBookingRoute(request({ body: { template: 'community-presentation-54' } }))
    expect(ok.status).toBe(201)
    expect(await count()).toBe(before + 1)
  })
})
