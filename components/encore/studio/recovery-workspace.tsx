'use client'

import dynamic from 'next/dynamic'
import { useApi } from '@/lib/client/api'
import type { CaseSummary, ReceiptSummary } from '@/lib/view-types'
import { LiveQueue } from '../live-queue'

const RecoveryStudio = dynamic(() => import('./recovery-studio').then((m) => m.RecoveryStudio), {
  ssr: false,
  loading: () => <StudioSkeleton />,
})

function StudioSkeleton() {
  return (
    <div
      className="h-[min(80vh,820px)] min-h-[560px] animate-pulse rounded-lg bg-surface-subdued"
      aria-busy="true"
      aria-label="Loading recovery workspace"
    />
  )
}

export function RecoveryWorkspace({ licenseKey }: { licenseKey?: string }) {
  const cases = useApi<{ cases: CaseSummary[] }>('/api/recovery/cases', { refreshInterval: 10000 })
  const receipts = useApi<{ receipts: ReceiptSummary[] }>('/api/receipts', { refreshInterval: 10000 })

  if (cases.error && !cases.data) return <p className="text-sm text-failure">Could not load cases.</p>
  if (!cases.data || !receipts.data) return <StudioSkeleton />
  // The existing queue owns the empty state and its link to demo setup.
  if (cases.data.cases.length === 0) return <LiveQueue />

  return <RecoveryStudio licenseKey={licenseKey} cases={cases.data.cases} receipts={receipts.data.receipts} />
}
