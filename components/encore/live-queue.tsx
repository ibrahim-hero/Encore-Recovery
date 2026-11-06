'use client'

import Link from 'next/link'
import { useApi } from '@/lib/client/api'
import type { CaseSummary } from '@/lib/view-types'
import { QueueList } from './queue-list'

export function LiveQueue() {
  const { data, error } = useApi<{ cases: CaseSummary[] }>('/api/recovery/cases', { refreshInterval: 10000 })

  if (error && !data) return <p className="text-sm text-failure">Could not load cases.</p>
  if (!data) return <div className="h-24 animate-pulse rounded-lg bg-surface-subdued" aria-busy="true" aria-label="Loading cases" />
  if (data.cases.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink">No recovery cases yet</p>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
          Create a booking, pay for it, then simulate a merchant failure from the demo setup.
        </p>
        <Link
          href="/demo"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-semibold text-surface hover:bg-action-hover"
        >
          Open demo setup
        </Link>
      </div>
    )
  }
  return <QueueList cases={data.cases} />
}
