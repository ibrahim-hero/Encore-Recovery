import { CalendarCheck, Store, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TruthFact } from '@/lib/view-types'
import { StatusChip } from './status-chip'

const sourceIcons = {
  BOOKING: CalendarCheck,
  FULFILLMENT: Store,
  PAYPAL: Landmark,
}

const valueTones = {
  confirmed: 'text-confirmed',
  attention: 'text-attention',
  failure: 'text-failure',
  neutral: 'text-ink',
}

// TruthCard: source label, value/status, observed time, source link
// (plan section 23). Amounts use tabular numerals.
export function TruthCard({
  fact,
  onViewSource,
  override,
}: {
  fact: TruthFact
  onViewSource?: (fact: TruthFact) => void
  override?: Pick<TruthFact, 'value' | 'detail' | 'tone'>
}) {
  const Icon = sourceIcons[fact.source]
  const value = override?.value ?? fact.value
  const detail = override?.detail ?? fact.detail
  const tone = override?.tone ?? fact.tone

  return (
    <article className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(20_43_53/0.04)]">
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-ink-muted">
          <Icon aria-hidden className="size-3.5" />
          {fact.source}
        </span>
        <StatusChip tone={tone}>{tone === 'neutral' ? 'Recorded' : tone}</StatusChip>
      </header>
      <p className={cn('tnum mt-3 text-2xl font-semibold tracking-tight', valueTones[tone])}>
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-ink">{fact.authority}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{detail}</p>
      <footer className="mt-auto flex items-center justify-between gap-2 pt-4">
        <time className="text-xs text-ink-muted">{fact.observedAt}</time>
        {onViewSource && (
          <button
            type="button"
            onClick={() => onViewSource(fact)}
            className="min-h-11 rounded-lg px-2 text-xs font-medium text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            View source
          </button>
        )}
      </footer>
    </article>
  )
}

// The Proof Canvas connector: a broken dashed segment marks the actual
// disagreement; confirmed facts make the line continuous (plan section 19).
// Horizontal on desktop, vertical on mobile (section 22).
export function ProofConnector({ broken }: { broken: boolean }) {
  return (
    <div
      aria-hidden
      className="flex items-center justify-center self-stretch py-1 md:w-10 md:shrink-0 md:py-0"
    >
      <span
        className={cn(
          'md:h-0 md:w-full md:border-t-2',
          'h-6 w-0 border-l-2 md:border-l-0',
          broken ? 'border-dashed border-attention' : 'border-solid border-confirmed',
        )}
      />
      {broken && (
        <span className="absolute flex size-5 items-center justify-center rounded-full border border-attention bg-attention-bg text-[10px] font-bold text-attention">
          /
        </span>
      )}
    </div>
  )
}
