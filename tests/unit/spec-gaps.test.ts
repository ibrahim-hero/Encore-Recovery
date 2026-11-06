import { describe, expect, it } from 'vitest'
import { validateDiagnosis } from '@/lib/ai/adapter'
import { evaluateEligibility, planFingerprint, type EligibilityInput } from '@/lib/domain/eligibility'
import { reduceRefundObservation } from '@/lib/domain/refund-reducer'
import type { AnalysisSnapshot } from '@/lib/domain/snapshot'
import { remainingCharge } from '@/lib/money'

const op = { id: 'op-1', amountCents: 5400, currency: 'USD' }

const base: EligibilityInput = {
  booking: { id: 'b1', revision: 3, fulfillmentState: 'UNFULFILLABLE', amountCents: 5400, currency: 'USD' },
  capture: { id: 'c1', providerCaptureId: 'CAP1', providerStatus: 'COMPLETED', amountCents: 5400, currency: 'USD', payeeMerchantId: 'M1' },
  policy: { id: 'merchant-unfulfillable:v1', contentHash: 'h' },
  approvedPolicyId: 'merchant-unfulfillable:v1',
  expectedMerchantId: 'M1',
  existingOperationState: null,
}

describe('U04 pending, failed and cancelled refunds', () => {
  it('never reduces PENDING, FAILED or CANCELLED to a completed refund', () => {
    expect(reduceRefundObservation(op, { status: 'PENDING' }).state).toBe('PROVIDER_PENDING')
    for (const status of ['FAILED', 'CANCELLED']) {
      const r = reduceRefundObservation(op, { status })
      expect(r).toEqual({ state: 'REJECTED', reason: `PROVIDER_STATUS_${status}` })
    }
  })

  it('deducts nothing from the charge when no completed refund is recorded', () => {
    expect(remainingCharge(5400, [])).toEqual({ remainingCents: 5400, reviewRequired: false })
  })
})

describe('U07 customer claim without merchant confirmation', () => {
  it.each(['SCHEDULED', 'CUSTOMER_REQUESTED_CANCELLATION', 'AT_RISK'])('has no executable plan when fulfillment is %s', (fulfillmentState) => {
    const r = evaluateEligibility({ ...base, booking: { ...base.booking, fulfillmentState } })
    expect(r.eligible).toBe(false)
    if (!r.eligible) expect(r.outcome).toBe('NEEDS_INFORMATION')
  })
})

describe('U08 merchant failure with a matching completed capture', () => {
  it('is eligible for a full refund of exactly the verified gross', () => {
    expect(evaluateEligibility(base)).toEqual({ eligible: true })
    expect(base.capture?.amountCents).toBe(base.booking.amountCents)
  })

  it('is not eligible when a refund operation already exists', () => {
    const r = evaluateEligibility({ ...base, existingOperationState: 'SUCCEEDED' })
    expect(r.eligible).toBe(false)
  })
})

describe('U09 facts change after plan creation', () => {
  const before = planFingerprint(base)
  it.each([
    ['booking revision', { ...base, booking: { ...base.booking, revision: 4 } }],
    ['fulfillment state', { ...base, booking: { ...base.booking, fulfillmentState: 'CLOSED' } }],
    ['capture status', { ...base, capture: { ...base.capture!, providerStatus: 'PENDING' } }],
    ['capture amount', { ...base, capture: { ...base.capture!, amountCents: 5300 } }],
    ['payee', { ...base, capture: { ...base.capture!, payeeMerchantId: 'M2' } }],
    ['policy content', { ...base, policy: { ...base.policy, contentHash: 'changed' } }],
    ['policy id', { ...base, policy: { ...base.policy, id: 'other:v2' } }],
  ])('changes the fingerprint when %s changes, so the old plan is stale', (_label, changed) => {
    expect(planFingerprint(changed as EligibilityInput)).not.toBe(before)
  })
})

describe('U10 refresh with unchanged facts', () => {
  it('keeps the fingerprint when only the observation time differs', () => {
    const refreshed = { ...base, observedAt: new Date(Date.now() + 60_000).toISOString() } as EligibilityInput
    expect(planFingerprint(refreshed)).toBe(planFingerprint(base))
  })
})

describe('U11 and U12 AI output contract', () => {
  const snapshot = {
    caseId: 'case-1',
    booking: { sourceId: 'booking:b1:revision:3' },
    policy: { sourceId: 'policy:merchant-unfulfillable:v1' },
    payment: { sourceId: 'capture:CAP1' },
    operation: null,
  } as unknown as AnalysisSnapshot
  const valid = {
    disposition: 'PROPOSE_FULL_REFUND',
    reasonCodes: ['MERCHANT_CONFIRMED_UNFULFILLABLE'],
    summary: 'Merchant confirmed it cannot provide the booking.',
    evidence: [{ sourceId: 'booking:b1:revision:3', field: 'fulfillment_status' }, { sourceId: 'capture:CAP1', field: 'status' }],
    missingInformation: [],
    customerMessageDraft: 'We cannot provide your booking.',
  }

  it('U11 rejects an amount, recipient, or any unexpected field', () => {
    for (const extra of [{ amount: '54.00' }, { amountCents: 5400 }, { recipient: 'attacker@example.com' }, { refundUrl: 'https://evil.example' }]) {
      expect(validateDiagnosis({ ...valid, ...extra }, snapshot).ok).toBe(false)
    }
  })

  it('U12 rejects a source reference that is not in the snapshot', () => {
    const r = validateDiagnosis({ ...valid, evidence: [{ sourceId: 'booking:other:revision:1', field: 'fulfillment_status' }] }, snapshot)
    expect(r.ok).toBe(false)
  })
})
