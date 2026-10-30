import { sha256, stableStringify } from '@/lib/crypto'

// Deterministic eligibility (PDF section 17). Pure: no I/O, no model input.

export type EligibilityInput = {
  booking: { id: string; revision: number; fulfillmentState: string; amountCents: number; currency: string }
  capture: {
    id: string
    providerCaptureId: string
    providerStatus: string
    amountCents: number
    currency: string
    payeeMerchantId: string | null
  } | null
  policy: { id: string; contentHash: string }
  approvedPolicyId: string
  expectedMerchantId: string
  existingOperationState: string | null
}

export type Eligibility =
  | { eligible: true }
  | {
      eligible: false
      outcome: 'NEEDS_INFORMATION' | 'WAIT_FOR_PAYMENT' | 'REVIEW_REQUIRED' | 'EXISTING_OPERATION'
      reason: string
    }

export function evaluateEligibility(i: EligibilityInput): Eligibility {
  if (i.booking.fulfillmentState !== 'UNFULFILLABLE') {
    return { eligible: false, outcome: 'NEEDS_INFORMATION', reason: 'MERCHANT_NOT_CONFIRMED_UNFULFILLABLE' }
  }
  if (!i.capture) return { eligible: false, outcome: 'WAIT_FOR_PAYMENT', reason: 'NO_VERIFIED_CAPTURE' }
  if (i.capture.providerStatus === 'PENDING') {
    return { eligible: false, outcome: 'WAIT_FOR_PAYMENT', reason: 'CAPTURE_PENDING' }
  }
  if (i.capture.providerStatus !== 'COMPLETED') {
    return { eligible: false, outcome: 'REVIEW_REQUIRED', reason: `CAPTURE_STATUS_${i.capture.providerStatus}` }
  }
  if (i.capture.payeeMerchantId !== i.expectedMerchantId) {
    return { eligible: false, outcome: 'REVIEW_REQUIRED', reason: 'PAYEE_MISMATCH' }
  }
  if (i.capture.currency !== i.booking.currency) {
    return { eligible: false, outcome: 'REVIEW_REQUIRED', reason: 'CURRENCY_MISMATCH' }
  }
  if (i.capture.amountCents !== i.booking.amountCents) {
    return { eligible: false, outcome: 'REVIEW_REQUIRED', reason: 'AMOUNT_MISMATCH' }
  }
  if (i.existingOperationState) {
    return { eligible: false, outcome: 'EXISTING_OPERATION', reason: `OPERATION_${i.existingOperationState}` }
  }
  if (i.policy.id !== i.approvedPolicyId) {
    return { eligible: false, outcome: 'REVIEW_REQUIRED', reason: 'POLICY_NOT_APPROVED' }
  }
  return { eligible: true }
}

/** Binds a plan to the exact facts it was built from (INV-07). */
export function planFingerprint(i: EligibilityInput): string {
  return sha256(
    stableStringify({
      bookingId: i.booking.id,
      revision: i.booking.revision,
      fulfillment: i.booking.fulfillmentState,
      captureId: i.capture?.providerCaptureId ?? null,
      captureStatus: i.capture?.providerStatus ?? null,
      amountCents: i.capture?.amountCents ?? null,
      currency: i.capture?.currency ?? null,
      payee: i.capture?.payeeMerchantId ?? null,
      policyId: i.policy.id,
      policyHash: i.policy.contentHash,
    }),
  )
}
