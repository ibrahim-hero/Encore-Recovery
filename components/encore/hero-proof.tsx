import { TruthCard } from './truth-card'
import type { TruthFact } from '@/lib/view-types'

const exampleFacts: TruthFact[] = [
  {
    source: 'BOOKING',
    authority: 'Customer booking',
    value: '$54.00',
    detail: 'Community presentation, paid and scheduled.',
    observedAt: 'Booked and paid',
    tone: 'confirmed',
    resourceId: 'example',
    facts: [],
  },
  {
    source: 'FULFILLMENT',
    authority: 'Merchant confirmation',
    value: 'Cannot fulfill',
    detail: 'The venue closed. The merchant confirmed the booking is unfulfillable.',
    observedAt: 'Merchant reported failure',
    tone: 'failure',
    resourceId: 'example',
    facts: [],
  },
  {
    source: 'PAYPAL',
    authority: 'PayPal capture read',
    value: '$54.00 captured',
    detail: 'Funds are held. No refund exists yet, so one recovery is valid.',
    observedAt: 'Verified by direct read',
    tone: 'attention',
    resourceId: 'example',
    facts: [],
  },
]

export function HeroProof() {
  return (
    <figure
      aria-label="Example case: the booking, the merchant, and PayPal disagree"
      className="flex flex-col gap-2"
    >
      <figcaption className="text-xs font-semibold tracking-widest text-surface/60">
        EXAMPLE CASE, THREE SOURCES
      </figcaption>
      {exampleFacts.map((fact, i) => (
        <div key={fact.source} className="flex flex-col gap-2">
          <TruthCard fact={fact} />
          {i < exampleFacts.length - 1 && (
            <span
              aria-hidden
              className={
                i === 0
                  ? 'mx-auto h-5 w-0 border-l-2 border-solid border-confirmed'
                  : 'mx-auto h-5 w-0 border-l-2 border-dashed border-attention'
              }
            />
          )}
        </div>
      ))}
    </figure>
  )
}
