import { ShieldCheck, Loader2 } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { RecoveryCase } from '@/lib/fixtures'

// RecoveryPreview: validated recommendation, fixed server-derived amount,
// policy/source links, and an explicit execute label (plan section 23).
// In T13 this becomes the encoreRecoveryPreview AG Studio custom widget.
export function RecoveryPreview({ caseData }: { caseData: RecoveryCase }) {
  const preview = caseData.preview
  if (!preview) return null

  return (
    <section
      aria-labelledby="recovery-preview-heading"
      className="rounded-xl border border-line bg-surface-subdued p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="recovery-preview-heading" className="text-sm font-semibold tracking-wide text-ink">
            Recovery Preview
          </h2>
          <p className="mt-1 text-base font-medium text-ink-body">{preview.recommendation}</p>
        </div>
        <p className="tnum text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          {formatMoney(preview.amountCents, caseData.currency)}
          <span className="ml-1.5 text-sm font-medium text-ink-muted">{caseData.currency}</span>
        </p>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{preview.explanation}</p>

      <p className="mt-3 text-xs text-ink-muted">
        Sources:{' '}
        {preview.sources.map((s, i) => (
          <span key={s}>
            {i > 0 && ' · '}
            <span className="font-medium text-link">{s}</span>
          </span>
        ))}
      </p>

      <div className="mt-4 hidden md:block">
        <ExecuteButton label={preview.actionLabel} />
      </div>
    </section>
  )
}

export function ExecuteButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-action px-5 text-sm font-semibold text-surface transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action md:w-auto"
    >
      <ShieldCheck aria-hidden className="size-4" />
      {label}
    </button>
  )
}

// OperationProgress: QUEUED/SENDING/UNKNOWN/PENDING states with a specific
// next action and truthful messages (plan section 23).
export function OperationProgress({ operation }: { operation: NonNullable<RecoveryCase['operation']> }) {
  return (
    <section
      aria-labelledby="operation-progress-heading"
      className="rounded-xl border border-attention/30 bg-attention-bg p-4 md:p-5"
    >
      <div className="flex items-center gap-2">
        <Loader2 aria-hidden className="size-4 animate-spin text-attention" />
        <h2 id="operation-progress-heading" className="text-sm font-semibold text-attention">
          Refund {operation.state === 'PENDING' ? 'pending' : operation.state.toLowerCase()}
        </h2>
      </div>
      <p className="mt-2 text-base font-medium text-ink-body">{operation.message}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{operation.nextAction}</p>
    </section>
  )
}
