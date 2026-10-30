// ---------------------------------------------------------------------------
// DESIGN-PREVIEW FIXTURES ONLY.
// These records exist so the Proof Canvas UI (plan sections 19-23, T12) can be
// built and reviewed before the backend lands. Every value here is illustrative
// and must be replaced by backend projections (verified PayPal Sandbox reads)
// in T05-T14. Do not treat any fixture status as a real executed transaction.
// ---------------------------------------------------------------------------

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

export interface CaseSnapshot {
  eventId: string
  booking: Pick<TruthFact, 'value' | 'detail' | 'tone'>
  fulfillment: Pick<TruthFact, 'value' | 'detail' | 'tone'>
  paypal: Pick<TruthFact, 'value' | 'detail' | 'tone'>
}

export type CaseStatus = 'NEEDS_RESOLUTION' | 'REFUND_PENDING' | 'RESOLVED'

export interface RecoveryCase {
  id: string
  code: string
  title: string
  mode: 'SANDBOX'
  status: CaseStatus
  amountCents: number
  currency: string
  updatedAt: string
  mismatch: { headline: string; body: string } | null
  booking: TruthFact
  fulfillment: TruthFact
  paypal: TruthFact
  /** Index of the broken connector segment: 0 = booking|fulfillment, 1 = fulfillment|paypal, null = continuous */
  brokenSegment: 0 | 1 | null
  preview: {
    recommendation: string
    amountCents: number
    sources: string[]
    actionLabel: string
    explanation: string
  } | null
  operation: {
    state: 'QUEUED' | 'SENDING' | 'UNKNOWN' | 'PENDING'
    message: string
    nextAction: string
  } | null
  receipt: {
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
  } | null
  events: EvidenceEvent[]
  snapshots: CaseSnapshot[]
}

const booking1042: TruthFact = {
  source: 'BOOKING',
  authority: 'Booking EN-1042',
  value: '$54.00',
  detail: 'Community presentation · sample service booking',
  observedAt: 'Observed 14:02:11 UTC',
  tone: 'neutral',
  resourceId: 'bk_9F2K1042',
  facts: [
    { label: 'Source type', value: 'Merchant booking record' },
    { label: 'Resource ID', value: 'bk_9F2K1042' },
    { label: 'Revision', value: 'v2' },
    { label: 'Observed', value: '2026-10-30 14:02:11 UTC' },
    { label: 'Source hash', value: 'sha256:8f2c…a41d' },
  ],
}

const fulfillment1042: TruthFact = {
  source: 'FULFILLMENT',
  authority: 'Merchant record · v2',
  value: 'Cannot fulfill',
  detail: 'Merchant-confirmed unfulfillable (simulated failure)',
  observedAt: 'Observed 14:05:47 UTC',
  tone: 'failure',
  resourceId: 'evt_77DF310A',
  facts: [
    { label: 'Source type', value: 'Merchant failure event' },
    { label: 'Resource ID', value: 'evt_77DF310A' },
    { label: 'Reason', value: 'Provider capacity lost (demonstration)' },
    { label: 'Observed', value: '2026-10-30 14:05:47 UTC' },
    { label: 'Source hash', value: 'sha256:1b9e…c702' },
  ],
}

const paypal1042: TruthFact = {
  source: 'PAYPAL',
  authority: 'PayPal Sandbox · verified read',
  value: 'Captured',
  detail: '$54.00 USD · capture 3GC99021XA7425129',
  observedAt: 'Observed 14:02:19 UTC',
  tone: 'confirmed',
  resourceId: '3GC99021XA7425129',
  facts: [
    { label: 'Source type', value: 'PayPal capture resource' },
    { label: 'Resource ID', value: '3GC99021XA7425129' },
    { label: 'Amount', value: '54.00 USD' },
    { label: 'Status', value: 'COMPLETED' },
    { label: 'Observed', value: '2026-10-30 14:02:19 UTC' },
    { label: 'Source hash', value: 'sha256:d451…9e0b' },
  ],
}

export const fixtureCases: RecoveryCase[] = [
  {
    id: 'en-1042',
    code: 'EN-1042',
    title: 'Community presentation · sample service booking',
    mode: 'SANDBOX',
    status: 'NEEDS_RESOLUTION',
    amountCents: 5400,
    currency: 'USD',
    updatedAt: '2026-10-30 14:05:47 UTC',
    mismatch: {
      headline: 'Paid, but not fulfilled.',
      body: 'The merchant cannot provide this booking. A resolution is needed.',
    },
    booking: booking1042,
    fulfillment: fulfillment1042,
    paypal: paypal1042,
    brokenSegment: 1,
    preview: {
      recommendation: 'Full refund to the original payer',
      amountCents: 5400,
      sources: ['Merchant policy v1', 'Capture 3GC99021XA7425129', 'Booking EN-1042'],
      actionLabel: 'Issue sandbox refund — $54.00',
      explanation:
        'Policy v1 requires a full refund when a paid booking is merchant-confirmed unfulfillable. The amount is server-derived and read-only.',
    },
    operation: null,
    receipt: null,
    events: [
      {
        id: 'ev-1',
        label: 'Payment confirmed',
        source: 'PayPal resource',
        time: '14:02:19 UTC',
        summary: 'Capture 3GC99021XA7425129 completed for 54.00 USD.',
      },
      {
        id: 'ev-2',
        label: 'Cannot fulfill',
        source: 'Merchant event',
        time: '14:05:47 UTC',
        summary: 'Merchant confirmed the booking cannot be provided (simulated).',
      },
      {
        id: 'ev-3',
        label: 'Refund proposed',
        source: 'Validated AI analysis',
        time: '14:06:02 UTC',
        summary: 'Full refund of 54.00 USD proposed under merchant policy v1.',
      },
    ],
    snapshots: [],
  },
  {
    id: 'en-1041',
    code: 'EN-1041',
    title: 'Workshop series · sample service booking',
    mode: 'SANDBOX',
    status: 'REFUND_PENDING',
    amountCents: 8600,
    currency: 'USD',
    updatedAt: '2026-10-30 13:58:20 UTC',
    mismatch: {
      headline: 'Refund in progress.',
      body: 'PayPal accepted the refund. Encore is waiting for confirmation.',
    },
    booking: { ...booking1042, authority: 'Booking EN-1041', value: '$86.00', resourceId: 'bk_9F2K1041' },
    fulfillment: { ...fulfillment1042, resourceId: 'evt_77DF30F2' },
    paypal: {
      ...paypal1042,
      value: 'Refund pending',
      detail: '$86.00 USD · refund 8HK18240SL445510T',
      tone: 'attention',
      resourceId: '8HK18240SL445510T',
    },
    brokenSegment: 1,
    preview: null,
    operation: {
      state: 'PENDING',
      message: 'PayPal is processing the refund.',
      nextAction: 'Check status — Encore reconciles automatically and confirms only a verified read.',
    },
    receipt: null,
    events: [
      {
        id: 'ev-1',
        label: 'Payment confirmed',
        source: 'PayPal resource',
        time: '13:41:03 UTC',
        summary: 'Capture completed for 86.00 USD.',
      },
      {
        id: 'ev-2',
        label: 'Cannot fulfill',
        source: 'Merchant event',
        time: '13:52:30 UTC',
        summary: 'Merchant confirmed the booking cannot be provided (simulated).',
      },
      {
        id: 'ev-3',
        label: 'Refund sent',
        source: 'PayPal resource',
        time: '13:58:20 UTC',
        summary: 'Refund 8HK18240SL445510T accepted by PayPal, status PENDING.',
      },
    ],
    snapshots: [],
  },
  {
    id: 'en-1037',
    code: 'EN-1037',
    title: 'Keynote recording · sample service booking',
    mode: 'SANDBOX',
    status: 'RESOLVED',
    amountCents: 12000,
    currency: 'USD',
    updatedAt: '2026-10-29 17:22:41 UTC',
    mismatch: null,
    booking: {
      ...booking1042,
      authority: 'Booking EN-1037',
      value: 'Cancelled',
      detail: 'Booking closed after confirmed refund',
      resourceId: 'bk_9F2K1037',
    },
    fulfillment: {
      ...fulfillment1042,
      value: 'Closed',
      tone: 'neutral',
      detail: 'Merchant record closed · v3',
      resourceId: 'evt_77DF2E91',
    },
    paypal: {
      ...paypal1042,
      value: 'Refunded',
      detail: '$120.00 USD · verified read',
      resourceId: '4WR96052KT118403B',
    },
    brokenSegment: null,
    preview: null,
    operation: null,
    receipt: {
      version: 1,
      captureId: '9XJ21804DP623452N',
      refundId: '4WR96052KT118403B',
      captureCents: 12000,
      refundCents: 12000,
      remainingCents: 0,
      policyVersion: 'v1',
      planId: 'plan_01J9Z8KQ4M',
      operationId: 'op_01J9Z8M2RT',
      observedAt: '2026-10-29 17:22:39 UTC',
      generatedAt: '2026-10-29 17:22:41 UTC',
    },
    events: [
      {
        id: 'ev-1',
        label: 'Capture confirmed',
        source: 'PayPal resource',
        time: '16:58:12 UTC',
        summary: 'Capture 9XJ21804DP623452N completed for 120.00 USD.',
      },
      {
        id: 'ev-2',
        label: 'Merchant failure',
        source: 'Merchant event',
        time: '17:10:05 UTC',
        summary: 'Merchant confirmed the booking cannot be provided (simulated).',
      },
      {
        id: 'ev-3',
        label: 'Plan accepted',
        source: 'Validated AI analysis',
        time: '17:11:48 UTC',
        summary: 'Full-refund plan plan_01J9Z8KQ4M accepted under policy v1.',
      },
      {
        id: 'ev-4',
        label: 'Refund confirmed',
        source: 'PayPal resource',
        time: '17:22:39 UTC',
        summary: 'Refund 4WR96052KT118403B completed; verified by direct read.',
      },
    ],
    snapshots: [
      {
        eventId: 'ev-1',
        booking: { value: '$120.00', detail: 'Booking EN-1037 · active', tone: 'neutral' },
        fulfillment: { value: 'Scheduled', detail: 'Merchant record · v1', tone: 'neutral' },
        paypal: { value: 'Captured', detail: '$120.00 USD · verified read', tone: 'confirmed' },
      },
      {
        eventId: 'ev-2',
        booking: { value: '$120.00', detail: 'Booking EN-1037 · at risk', tone: 'attention' },
        fulfillment: { value: 'Cannot fulfill', detail: 'Merchant record · v2', tone: 'failure' },
        paypal: { value: 'Captured', detail: '$120.00 USD · verified read', tone: 'confirmed' },
      },
      {
        eventId: 'ev-3',
        booking: { value: '$120.00', detail: 'Booking EN-1037 · resolution planned', tone: 'attention' },
        fulfillment: { value: 'Cannot fulfill', detail: 'Merchant record · v2', tone: 'failure' },
        paypal: { value: 'Captured', detail: '$120.00 USD · verified read', tone: 'confirmed' },
      },
      {
        eventId: 'ev-4',
        booking: { value: 'Cancelled', detail: 'Booking closed after confirmed refund', tone: 'neutral' },
        fulfillment: { value: 'Closed', detail: 'Merchant record · v3', tone: 'neutral' },
        paypal: { value: 'Refunded', detail: '$120.00 USD · verified read', tone: 'confirmed' },
      },
    ],
  },
]

export function getFixtureCase(id: string): RecoveryCase | undefined {
  return fixtureCases.find((c) => c.id === id)
}
