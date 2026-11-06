'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import type { CaseSummary, CaseStatus } from '@/lib/view-types'
import { StatusChip } from './status-chip'

const filters: { value: CaseStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All cases' },
  { value: 'NEEDS_RESOLUTION', label: 'Needs resolution' },
  { value: 'REFUND_PENDING', label: 'Refund pending' },
  { value: 'RESOLVED', label: 'Resolved' },
]

const statusChip: Record<CaseStatus, { tone: 'attention' | 'info' | 'confirmed'; label: string }> = {
  NEEDS_RESOLUTION: { tone: 'attention', label: 'Needs resolution' },
  REFUND_PENDING: { tone: 'info', label: 'Refund pending' },
  RESOLVED: { tone: 'confirmed', label: 'Resolved' },
}

// Recovery queue: owned cases, exact status filters, most recent update,
// currency-aware amounts, and a useful empty state (plan section 23).
export function QueueList({ cases }: { cases: CaseSummary[] }) {
  const [filter, setFilter] = useState<CaseStatus | 'ALL'>('ALL')
  const visible = cases.filter((c) => filter === 'ALL' || c.status === filter)

  return (
    <div>
      <div role="group" aria-label="Filter cases by status" className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cn(
              'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors',
              filter === f.value
                ? 'border-ink bg-ink text-surface'
                : 'border-line bg-surface text-ink-body hover:bg-surface-subdued',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
          <Inbox aria-hidden className="size-6 text-ink-muted" />
          <p className="mt-3 text-sm font-medium text-ink">No cases in this state</p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            When a paid booking becomes merchant-confirmed unfulfillable, a recovery case appears
            here with its evidence and next action.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 xl:grid-cols-2">
          {visible.map((c) => {
            const chip = statusChip[c.status]
            return (
              <li key={c.id}>
                <Link
                  href={`/case/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:bg-surface-subdued/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="tnum text-base font-semibold text-ink">{c.code}</span>
                      <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                    </div>
                    <p className="mt-1 truncate text-sm text-ink-muted">{c.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">Updated {c.updatedAt}</p>
                  </div>
                  <p className="tnum text-xl font-semibold text-ink">
                    {formatMoney(c.amountCents, c.currency)}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
