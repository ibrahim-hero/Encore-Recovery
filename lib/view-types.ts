// Shapes returned by the API projections and consumed by the UI.

export type FactTone = 'confirmed' | 'attention' | 'failure' | 'neutral'

export interface TruthFact {
  source: 'BOOKING' | 'FULFILLMENT' | 'PAYPAL'
  authority: string
  value: string
  detail: string
  observedAt: string
  tone: FactTone
  resourceId: string
  facts: { label: string; value: string }[]
}

export interface EvidenceEvent {
  id: string
  label: string
  source: string
  time: string
  summary: string
}

export type FactSnapshot = Pick<TruthFact, 'value' | 'detail' | 'tone'>

export interface CaseSnapshot {
  eventId: string
  booking: FactSnapshot
  fulfillment: FactSnapshot
  paypal: FactSnapshot
}

export type CaseStatus = 'NEEDS_RESOLUTION' | 'REFUND_PENDING' | 'RESOLVED'

export type OperationState =
  | 'QUEUED'
  | 'SENDING'
  | 'UNKNOWN'
  | 'PROVIDER_PENDING'
  | 'SUCCEEDED'
  | 'REJECTED'
  | 'MANUAL_REVIEW'

export interface ReceiptView {
  version: number
  captureId: string
  refundId: string
  captureCents: number
  refundCents: number
  remainingCents: number
  policyVersion: string
  planId: string
  operationId: string
  observedAt: string
  generatedAt: string
  verifiedAgainst: string
  contentHash: string
}

export interface CaseView {
  id: string
  code: string
  title: string
  bookingId: string
  mode: 'SANDBOX' | 'FIXTURE'
  status: CaseStatus
  caseState: string
  reviewReason: string | null
  amountCents: number
  currency: string
  updatedAt: string
  mismatch: { headline: string; body: string } | null
  booking: TruthFact
  fulfillment: TruthFact
  paypal: TruthFact
  /** 0 = booking|fulfillment, 1 = fulfillment|paypal, null = continuous */
  brokenSegment: 0 | 1 | null
  analysis: {
    id: string
    state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
    model: string
    disposition: string | null
    summary: string | null
    reasonCodes: string[]
    missingInformation: string[]
    error: string | null
  } | null
  preview: {
    planId: string
    recommendation: string
    amountCents: number
    sources: string[]
    actionLabel: string
    explanation: string
    expiresAt: string
  } | null
  operation: {
    id: string
    state: OperationState
    message: string
    nextAction: string
    refundId: string | null
    sendAttempts: number
  } | null
  receipt: ReceiptView | null
  events: EvidenceEvent[]
  snapshots: CaseSnapshot[]
  fault: { armed: boolean; triggered: boolean }
  can: { analyze: boolean; execute: boolean; reconcile: boolean; armFault: boolean }
  /** Client should poll quickly while background work is in flight. */
  busy: boolean
}

export interface CaseSummary {
  id: string
  code: string
  title: string
  status: CaseStatus
  caseState: string
  amountCents: number
  currency: string
  updatedAt: string
}

export interface BookingSummary {
  id: string
  code: string
  title: string
  amountCents: number
  currency: string
  paymentState: string
  fulfillmentState: string
  caseId: string | null
  orderState: string | null
  approveUrl: string | null
  createdAt: string
}

export interface ReceiptSummary {
  caseId: string
  code: string
  version: number
  refundId: string
  refundCents: number
  currency: string
  generatedAt: string
  verifiedAgainst: string
}

export interface SystemStatus {
  mode: 'SANDBOX' | 'FIXTURE'
  database: 'pg' | 'pglite'
  aiModel: string
  paypalConfigured: boolean
  webhookConfigured: boolean
  missing: string[]
  workerLastSeen: string | null
}
