'use client'

import type { AgWidgetParams } from 'ag-studio'
import { ShieldCheck } from 'lucide-react'
import { RECEIPTS_SOURCE, RECEIPT_FIELDS, formatUsd, readRow } from '@/lib/studio/datasets'
import { formatTime } from './format-time'
import { useWidgetRows } from './use-widget-rows'

export function EvidenceReceiptWidget(params: AgWidgetParams) {
  const state = useWidgetRows(params, RECEIPTS_SOURCE, RECEIPT_FIELDS, 'encore-evidence-receipt')
  if (state.status !== 'ready') {
    return state.status === 'error' ? (
      <p className="p-4 text-sm text-failure">Could not load receipts for this view.</p>
    ) : null
  }

  const receipts = state.rows
    .map((r) => readRow(r, RECEIPTS_SOURCE, RECEIPT_FIELDS))
    .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))
    .slice(0, 4)

  return (
    <section aria-label="Evidence receipts" className="flex h-full flex-col gap-3 overflow-auto bg-surface p-5 font-sans">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-confirmed" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Evidence receipts</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {receipts.map((r) => (
          <li key={`${r.caseId}-${r.version}`} className="flex flex-col gap-2 rounded-lg border border-line p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm text-ink-muted">
                {String(r.code)} · v{String(r.version)}
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums text-confirmed">
                {formatUsd(r.refundUsd, String(r.currency || 'USD'))}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs leading-relaxed">
              <dt className="text-ink-muted">Refund</dt>
              <dd className="truncate font-mono text-ink-body">{String(r.refundId)}</dd>
              <dt className="text-ink-muted">Verified</dt>
              <dd className="text-ink-body">{String(r.verifiedAgainst)}</dd>
              <dt className="text-ink-muted">Issued</dt>
              <dd className="text-ink-body">{formatTime(r.generatedAt)}</dd>
            </dl>
            <a
              href={`/case/${encodeURIComponent(String(r.caseId))}`}
              className="text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              View receipt
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
