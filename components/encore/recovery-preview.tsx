'use client'

import { ShieldCheck, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { CaseView } from '@/lib/view-types'

// RecoveryPreview: validated recommendation, fixed server-derived amount,
// policy/source links, and an explicit execute label (plan section 23).
export function RecoveryPreview({
  caseData,
  onExecute,
  executing,
}: {
  caseData: CaseView
  onExecute: () => void
  executing: boolean
}) {
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

      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        Sources:{' '}
        {preview.sources.map((s, i) => (
          <span key={s}>
            {i > 0 && ' · '}
            <span className="tnum break-all font-medium text-link">{s}</span>
          </span>
        ))}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Amount, payee, and capture are taken from the verified capture record, never from the model.
      </p>

      <div className="mt-4 hidden md:block">
        <ExecuteButton label={preview.actionLabel} onClick={onExecute} pending={executing} />
      </div>
    </section>
  )
}

export function ExecuteButton({
  label,
  onClick,
  pending,
}: {
  label: string
  onClick: () => void
  pending: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-action px-5 text-sm font-semibold text-surface transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-70 md:w-auto"
    >
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ShieldCheck aria-hidden className="size-4" />}
      {label}
    </button>
  )
}

const failureStates = new Set(['REJECTED', 'MANUAL_REVIEW'])

// OperationProgress: QUEUED/SENDING/UNKNOWN/PENDING states with a specific
// next action and truthful messages (plan section 23).
export function OperationProgress({
  operation,
  canReconcile,
  onReconcile,
  reconciling,
}: {
  operation: NonNullable<CaseView['operation']>
  canReconcile: boolean
  onReconcile: () => void
  reconciling: boolean
}) {
  if (operation.state === 'SUCCEEDED') return null
  const failed = failureStates.has(operation.state)
  const title: Record<string, string> = {
    QUEUED: 'Refund queued',
    SENDING: 'Refund sending',
    UNKNOWN: 'Refund outcome unknown',
    PROVIDER_PENDING: 'Refund pending at PayPal',
    REJECTED: 'Refund rejected',
    MANUAL_REVIEW: 'Refund needs review',
  }

  return (
    <section
      aria-labelledby="operation-progress-heading"
      aria-live="polite"
      className={cn(
        'rounded-xl border p-4 md:p-5',
        failed ? 'border-failure/30 bg-failure-bg' : 'border-attention/30 bg-attention-bg',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {failed ? (
            <XCircle aria-hidden className="size-4 text-failure" />
          ) : (
            <Loader2 aria-hidden className="size-4 animate-spin text-attention" />
          )}
          <h2
            id="operation-progress-heading"
            className={cn('text-sm font-semibold', failed ? 'text-failure' : 'text-attention')}
          >
            {title[operation.state]}
          </h2>
        </div>
        {canReconcile && (
          <button
            type="button"
            onClick={onReconcile}
            disabled={reconciling}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-subdued focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60"
          >
            <RefreshCw aria-hidden className={cn('size-4', reconciling && 'animate-spin')} />
            Check status
          </button>
        )}
      </div>
      <p className="mt-2 text-base font-medium text-ink-body">{operation.message}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{operation.nextAction}</p>
      <p className="tnum mt-2 text-xs text-ink-muted">
        Operation {operation.id.slice(0, 8)} · send attempts {operation.sendAttempts}
        {operation.refundId ? ` · refund ${operation.refundId}` : ''}
      </p>
    </section>
  )
}
