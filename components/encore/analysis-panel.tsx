'use client'

import { Sparkles, Loader2, AlertTriangle, FlaskConical } from 'lucide-react'
import type { CaseView } from '@/lib/view-types'
import { cn } from '@/lib/utils'

// AI diagnosis status: run/retry, visible failure, and non-refund outcomes.
// The model never produces an executable plan; deterministic rules do (section 16-17).
export function AnalysisPanel({
  caseData,
  onAnalyze,
  analyzing,
}: {
  caseData: CaseView
  onAnalyze: () => void
  analyzing: boolean
}) {
  const a = caseData.analysis
  const running = caseData.caseState === 'ANALYZING' || analyzing
  if (caseData.preview || caseData.operation || caseData.caseState === 'RESOLVED_REFUNDED') return null

  return (
    <section aria-labelledby="analysis-heading" aria-live="polite" className="rounded-lg border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="analysis-heading" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-ink">
            <Sparkles aria-hidden className="size-4 text-action" />
            AI diagnosis
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {running
              ? 'Reading the case, the attached policy, and verified payment evidence.'
              : a?.state === 'FAILED'
                ? 'The last diagnosis did not complete. No plan was created; the facts above remain accurate.'
                : a?.state === 'SUCCEEDED'
                  ? 'The diagnosis did not produce an executable plan.'
                  : 'Diagnose this case. A refund plan is created only if deterministic policy checks agree.'}
          </p>
        </div>
        {caseData.can.analyze && (
          <button
            type="button"
            onClick={onAnalyze}
            disabled={running}
            aria-busy={running}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-surface transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60"
          >
            {running ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Sparkles aria-hidden className="size-4" />}
            {running ? 'Analyzing' : a ? 'Retry analysis' : 'Analyze case'}
          </button>
        )}
      </div>

      {!running && a?.state === 'FAILED' && a.error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-failure-bg p-3 text-sm text-failure">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{a.error}</span>
        </p>
      )}

      {!running && a?.state === 'SUCCEEDED' && (
        <div className="mt-3 rounded-lg bg-surface-subdued p-3">
          <p className="text-xs font-semibold tracking-widest text-ink-muted">{a.disposition}</p>
          {a.summary && <p className="mt-1 text-sm leading-relaxed text-ink-body">{a.summary}</p>}
          {a.missingInformation.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
              {a.missingInformation.map((m) => (
                <li key={m}>Missing: {m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {caseData.reviewReason && !running && (
        <p className="mt-3 text-sm leading-relaxed text-attention">{caseData.reviewReason}</p>
      )}

      {a && <p className="tnum mt-3 text-xs text-ink-muted">Model {a.model}</p>}
    </section>
  )
}

// Fault Lab (D.11): arm a single genuine fault before executing.
export function FaultLab({
  caseData,
  onArm,
  arming,
}: {
  caseData: CaseView
  onArm: () => void
  arming: boolean
}) {
  if (!caseData.preview && !caseData.fault.armed) return null
  if (caseData.operation && !caseData.fault.armed) return null

  return (
    <section
      aria-labelledby="fault-lab-heading"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line bg-surface p-4"
    >
      <div className="min-w-0">
        <h2 id="fault-lab-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FlaskConical aria-hidden className="size-4 text-ink-muted" />
          Fault Lab
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {caseData.fault.triggered
            ? 'Fault triggered: the provider accepted the refund but its response was dropped. Encore reconciled with the same request ID.'
            : caseData.fault.armed
              ? 'Armed: the next refund response will be dropped after the provider accepts it.'
              : 'Drop the refund response after the provider accepts it, to prove an unknown outcome never creates a second refund.'}
        </p>
      </div>
      {caseData.can.armFault && (
        <button
          type="button"
          onClick={onArm}
          disabled={arming}
          className={cn(
            'inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-subdued focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60',
          )}
        >
          Arm dropped response
        </button>
      )}
    </section>
  )
}
