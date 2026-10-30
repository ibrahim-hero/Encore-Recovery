import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// MismatchRibbon: a human-readable disagreement statement derived from state,
// never a generic warning on every case (plan section 23).
export function MismatchRibbon({
  headline,
  body,
  resolved = false,
}: {
  headline: string
  body: string
  resolved?: boolean
}) {
  const Icon = resolved ? CheckCircle2 : AlertTriangle
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3',
        resolved ? 'border-confirmed/30 bg-confirmed-bg' : 'border-attention/30 bg-attention-bg',
      )}
    >
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-5 shrink-0', resolved ? 'text-confirmed' : 'text-attention')}
      />
      <div>
        <p className={cn('text-base font-semibold', resolved ? 'text-confirmed' : 'text-attention')}>
          {headline}
        </p>
        <p className="text-sm leading-relaxed text-ink-body">{body}</p>
      </div>
    </div>
  )
}
