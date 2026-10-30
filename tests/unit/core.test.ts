import { describe, expect, it } from 'vitest'
import { validateDiagnosis } from '@/lib/ai/adapter'
import { evaluateEligibility, planFingerprint, type EligibilityInput } from '@/lib/domain/eligibility'
import { canReplay, reduceRefundObservation } from '@/lib/domain/refund-reducer'
import type { AnalysisSnapshot } from '@/lib/domain/snapshot'
import { amountMatches, centsToDecimal, decimalToCents, remainingCharge } from '@/lib/money'

describe('money (U01, U02, U03)', () => {
  it('U01 formats and parses integer cents exactly', () => {
    expect(centsToDecimal(5400)).toBe('54.00')
    expect(centsToDecimal(5)).toBe('0.05')
    expect(decimalToCents('54.00')).toBe(5400)
    expect(decimalToCents('18.5')).toBe(1850)
    expect(decimalToCents('0.10')).toBe(10)
  })
  it('U02 rejects malformed money strings', () => {
    for (const bad of ['54.001', '-1.00', '1e3', '', '12,00', ' 1.00']) expect(() => decimalToCents(bad)).toThrow()
    expect(amountMatches('54.00', 5400)).toBe(true)
    expect(amountMatches('54.01', 5400)).toBe(false)
    expect(amountMatches(undefined, 5400)).toBe(false)
  })
  it('U03 counts each refund ID once and flags negative remaining', () => {
    expect(remainingCharge(5400, [{ refundId: 'R1', cents: 5400 }, { refundId: 'R1', cents: 5400 }])).toEqual({
      remainingCents: 0,
      reviewRequired: false,
    })
    expect(remainingCharge(5400, [{ refundId: 'R1', cents: 5400 }, { refundId: 'R2', cents: 100 }])).toEqual({
      remainingCents: 0,
      reviewRequired: true,
    })
  })
})

describe('refund reducer (U05, U06)', () => {
  const op = { id: 'op-1', amountCents: 5400, currency: 'USD' }
  it('completes only on a matching COMPLETED read', () => {
    expect(reduceRefundObservation(op, { status: 'COMPLETED', amount: { value: '54.00', currency_code: 'USD' }, invoice_id: 'ER-op-1' }).state).toBe('SUCCEEDED')
    expect(reduceRefundObservation(op, { status: 'COMPLETED', amount: { value: '50.00', currency_code: 'USD' }, invoice_id: 'ER-op-1' }).state).toBe('MANUAL_REVIEW')
    expect(reduceRefundObservation(op, { status: 'COMPLETED', amount: { value: '54.00', currency_code: 'USD' }, invoice_id: 'ER-other' }).state).toBe('MANUAL_REVIEW')
  })
  it('U05 PENDING stays PROVIDER_PENDING, never SUCCEEDED', () => {
    expect(reduceRefundObservation(op, { status: 'PENDING' }).state).toBe('PROVIDER_PENDING')
  })
  it('U06 unrecognised status goes to review with the raw value preserved', () => {
    const r = reduceRefundObservation(op, { status: 'WEIRD' })
    expect(r).toEqual({ state: 'MANUAL_REVIEW', reason: 'UNRECOGNIZED_PROVIDER_STATUS:WEIRD' })
  })
  it('replay window is bounded by deadline and attempts', () => {
    const future = new Date(Date.now() + 60_000)
    expect(canReplay({ sendAttempts: 1, replayDeadline: future })).toBe(true)
    expect(canReplay({ sendAttempts: 5, replayDeadline: future })).toBe(false)
    expect(canReplay({ sendAttempts: 1, replayDeadline: new Date(Date.now() - 1) })).toBe(false)
    expect(canReplay({ sendAttempts: 1, replayDeadline: null })).toBe(false)
  })
})

describe('eligibility (PDF section 17)', () => {
  const base: EligibilityInput = {
    booking: { id: 'b1', revision: 3, fulfillmentState: 'UNFULFILLABLE', amountCents: 5400, currency: 'USD' },
    capture: { id: 'c1', providerCaptureId: 'CAP1', providerStatus: 'COMPLETED', amountCents: 5400, currency: 'USD', payeeMerchantId: 'M1' },
    policy: { id: 'merchant-unfulfillable:v1', contentHash: 'h' },
    approvedPolicyId: 'merchant-unfulfillable:v1',
    expectedMerchantId: 'M1',
    existingOperationState: null,
  }
  it('eligible only when every check passes', () => {
    expect(evaluateEligibility(base)).toEqual({ eligible: true })
  })
  it.each([
    [{ booking: { ...base.booking, fulfillmentState: 'SCHEDULED' } }, 'NEEDS_INFORMATION'],
    [{ capture: null }, 'WAIT_FOR_PAYMENT'],
    [{ capture: { ...base.capture!, providerStatus: 'PENDING' } }, 'WAIT_FOR_PAYMENT'],
    [{ capture: { ...base.capture!, payeeMerchantId: 'OTHER' } }, 'REVIEW_REQUIRED'],
    [{ capture: { ...base.capture!, amountCents: 5300 } }, 'REVIEW_REQUIRED'],
    [{ existingOperationState: 'QUEUED' }, 'EXISTING_OPERATION'],
    [{ policy: { id: 'other', contentHash: 'h' } }, 'REVIEW_REQUIRED'],
  ])('rejects %o as %s', (patch, outcome) => {
    const r = evaluateEligibility({ ...base, ...patch } as EligibilityInput)
    expect(r.eligible).toBe(false)
    if (!r.eligible) expect(r.outcome).toBe(outcome)
  })
  it('fingerprint changes when facts change', () => {
    expect(planFingerprint(base)).toBe(planFingerprint({ ...base }))
    expect(planFingerprint(base)).not.toBe(planFingerprint({ ...base, booking: { ...base.booking, revision: 4 } }))
  })
})

describe('AI contract validation (A-series)', () => {
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
  it('accepts a valid diagnosis', () => {
    expect(validateDiagnosis(valid, snapshot).ok).toBe(true)
  })
  it('rejects extra fields such as an amount', () => {
    expect(validateDiagnosis({ ...valid, amount: '54.00' }, snapshot).ok).toBe(false)
  })
  it('rejects evidence that does not exist in the snapshot', () => {
    expect(validateDiagnosis({ ...valid, evidence: [{ sourceId: 'capture:FOREIGN', field: 'status' }] }, snapshot).ok).toBe(false)
  })
  it('rejects non-citable fields', () => {
    expect(validateDiagnosis({ ...valid, evidence: [{ sourceId: 'capture:CAP1', field: 'payee' }] }, snapshot).ok).toBe(false)
  })
  it('rejects unknown dispositions', () => {
    expect(validateDiagnosis({ ...valid, disposition: 'REFUND_NOW' }, snapshot).ok).toBe(false)
  })
})
