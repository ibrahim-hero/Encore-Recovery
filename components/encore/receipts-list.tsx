'use client'

import Link from 'next/link'
import { ReceiptText, BadgeCheck } from 'lucide-react'
import { useApi } from '@/lib/client/api'
import { formatMoney } from '@/lib/money'
import type { ReceiptSummary } from '@/lib/view-types'

export function ReceiptsList() {
  const { data, error } = useApi<{ receipts: ReceiptSummary[] }>('/api/receipts')

  if (error && !data) return <p className="mt-6 text-sm text-failure">Could not load receipts.</p>
  if (!data) return <div className="mt-6 h-24 animate-pulse rounded-xl bg-surface-subdued" aria-busy="true" aria-label="Loading receipts" />

  if (data.receipts.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
        <ReceiptText aria-hidden className="size-6 text-ink-muted" />
        <p className="mt-3 text-sm font-medium text-ink">No receipts yet</p>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
          A receipt appears when a refund is confirmed COMPLETED and Encore verifies it with a direct read.
        </p>
      </div>
    )
  }

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {data.receipts.map((r) => (
        <li key={`${r.caseId}-${r.version}`}>
          <Link
            href={`/case/${r.caseId}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-subdued/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tnum text-base font-semibold text-ink">{r.code}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-confirmed-bg px-2.5 py-1 text-xs font-medium text-confirmed">
                  <BadgeCheck aria-hidden className="size-3.5" />
                  {r.verifiedAgainst}
                </span>
              </div>
              <p className="tnum mt-1 text-xs text-ink-muted">
                Refund {r.refundId} · v{r.version} · {r.generatedAt}
              </p>
            </div>
            <p className="tnum text-xl font-semibold text-ink">{formatMoney(r.refundCents, r.currency)}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
