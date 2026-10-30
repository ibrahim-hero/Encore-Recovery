'use client'

import type { AgWidgetParams } from 'ag-studio'
import { ArrowRight } from 'lucide-react'
import { CASES_SOURCE, CASE_FIELDS, STATUS_LABEL, formatUsd, readRow } from '@/lib/studio/datasets'
import { useWidgetRows } from './use-widget-rows'

const PRIORITY: Record<string, number> = {
  [STATUS_LABEL.NEEDS_RESOLUTION]: 0,
  [STATUS_LABEL.REFUND_PENDING]: 1,
  [STATUS_LABEL.RESOLVED]: 2,
}

const GUIDANCE: Record<string, string> = {
  [STATUS_LABEL.NEEDS_RESOLUTION]:
    'Paid, but fulfillment failed. Open the case to run the diagnosis and review the server-validated refund plan.',
  [STATUS_LABEL.REFUND_PENDING]:
    'A refund was sent. Encore is waiting for PayPal to confirm it; nothing needs to be resent.',
  [STATUS_LABEL.RESOLVED]: 'Every case in this view is resolved and has a verified Evidence Receipt.',
}

export function RecoveryPreviewWidget(params: AgWidgetParams) {
  const state = useWidgetRows(params, CASES_SOURCE, CASE_FIELDS, 'encore-recovery-preview')
  if (state.status !== 'ready') {
    return state.status === 'error' ? (
      <p className="p-4 text-sm text-failure">Could not load cases for this view.</p>
    ) : null
  }

  const rows = state.rows
    .map((r) => readRow(r, CASES_SOURCE, CASE_FIELDS))
    .sort(
      (a, b) =>
        (PRIORITY[String(a.status)] ?? 3) - (PRIORITY[String(b.status)] ?? 3) ||
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
    )
  const next = rows[0]
  if (!next) return null

  const open = rows.filter((r) => r.status !== STATUS_LABEL.RESOLVED)
  const exposure = open.reduce((sum, r) => sum + (Number(r.amountUsd) || 0), 0)
  const status = String(next.status)
  const tone =
    status === STATUS_LABEL.RESOLVED
      ? 'bg-confirmed-bg text-confirmed'
      : status === STATUS_LABEL.REFUND_PENDING
        ? 'bg-attention-bg text-attention'
        : 'bg-failure-bg text-failure'

  return (
    <section aria-label="Recovery preview" className="flex h-full flex-col gap-4 overflow-auto bg-surface p-5 font-sans">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {status === STATUS_LABEL.RESOLVED ? 'All clear' : 'Next recovery'}
        </p>
        <p className="text-xs text-ink-muted">
          {open.length} open {open.length === 1 ? 'case' : 'cases'} · {formatUsd(exposure)} at stake
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-ink-muted">{String(next.code)}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>
        </div>
        <h3 className="text-pretty text-lg font-semibold leading-snug text-ink">{String(next.title)}</h3>
        <p className="font-mono text-3xl font-semibold tabular-nums text-ink">
          {formatUsd(next.amountUsd, String(next.currency || 'USD'))}
        </p>
        <p className="max-w-prose text-sm leading-relaxed text-ink-body">{GUIDANCE[status]}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-3">
        <a
          href={`/case/${encodeURIComponent(String(next.caseId))}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-surface hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Open case
          <ArrowRight className="size-4" aria-hidden="true" />
        </a>
        <p className="text-xs leading-relaxed text-ink-muted">
          Refunds run only from the case page, after server validation.
        </p>
      </div>
    </section>
  )
}
