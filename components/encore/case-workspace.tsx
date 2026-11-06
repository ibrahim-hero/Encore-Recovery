'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { apiGet, apiPost, useApi, ApiError } from '@/lib/client/api'
import type { CaseView, TruthFact } from '@/lib/view-types'
import { TruthCard, ProofConnector } from './truth-card'
import { MismatchRibbon } from './mismatch-ribbon'
import { RecoveryPreview, OperationProgress, ExecuteButton } from './recovery-preview'
import { AnalysisPanel, FaultLab } from './analysis-panel'
import { EvidenceReceipt } from './evidence-receipt'
import { ReplayStepper } from './replay-stepper'
import { EvidenceDrawer } from './evidence-drawer'
import { StatusChip } from './status-chip'

type Action = 'analyze' | 'execute' | 'reconcile' | 'arm'

// The Proof Canvas case workspace (plan sections 19-23). One selected case,
// one obvious next action, evidence on demand. Replay re-renders immutable
// snapshots with financial actions removed from the DOM.
export function CaseWorkspace({ caseId }: { caseId: string }) {
  const url = `/api/recovery/cases/${caseId}`
  const { data, error, mutate } = useApi<CaseView>(url, {
    refreshInterval: (latest) => (latest?.busy ? 2500 : 15000),
  })

  // Preview has no long-running worker: while work is in flight, drain this
  // workspace's due jobs on the same cadence, then refresh the projection.
  // The tick returns the post-drain projection and writes it directly, so a slower,
  // older GET cannot overwrite it with stale state.
  useSWR(
    data?.busy ? ['tick', caseId] : null,
    async () => {
      await apiPost('/api/jobs/tick')
      return apiGet<CaseView>(url)
    },
    {
      refreshInterval: 2500,
      revalidateOnFocus: false,
      onSuccess: (fresh) => mutate(fresh, { revalidate: false }),
    },
  )

  const [drawerFact, setDrawerFact] = useState<TruthFact | null>(null)
  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  const [pending, setPending] = useState<Action | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: Action, fn: () => Promise<unknown>) {
    setPending(action)
    setActionError(null)
    try {
      await fn()
      await mutate()
    } catch (err) {
      setActionError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Something went wrong.')
      await mutate()
    } finally {
      setPending(null)
    }
  }

  if (error && !data) {
    return (
      <div className="mx-auto w-full max-w-[1760px] px-4 py-10 md:px-8">
        <p className="text-base font-medium text-ink">
          {error instanceof ApiError && error.status === 404 ? 'Case not found in this workspace.' : 'Could not load this case.'}
        </p>
        <Link href="/recovery" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-link">
          <ArrowLeft aria-hidden className="size-4" /> Back to recovery queue
        </Link>
      </div>
    )
  }
  if (!data) return <CaseSkeleton />

  const caseData = data
  const replaying = replayIndex !== null && caseData.snapshots.length > 0
  const snapshot = replaying ? caseData.snapshots.find((s) => s.eventId === caseData.events[replayIndex].id) : undefined
  const resolved = caseData.status === 'RESOLVED'
  const broken = replaying
    ? snapshot?.fulfillment.tone === 'failure' && snapshot?.paypal.tone !== 'confirmed'
      ? 1
      : null
    : caseData.brokenSegment

  const execute = () => run('execute', () => apiPost(`/api/recovery/plans/${caseData.preview!.planId}/execute`))

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10" data-replay={replaying ? 'true' : undefined}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-ink-muted">CASE</p>
          <h1 className="tnum text-2xl font-semibold tracking-tight text-ink md:text-3xl">Case {caseData.code}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">{caseData.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip tone={caseData.mode === 'SANDBOX' ? 'attention' : 'info'}>{caseData.mode}</StatusChip>
          <span className="text-xs text-ink-muted">Synced {caseData.updatedAt}</span>
        </div>
      </header>

      <div className="mt-5">
        {resolved ? (
          <MismatchRibbon resolved headline="Refund verified" body="The recorded payment and resolution now agree." />
        ) : caseData.mismatch ? (
          <MismatchRibbon headline={caseData.mismatch.headline} body={caseData.mismatch.body} />
        ) : null}
      </div>

      <section aria-label="Proof canvas" className="mt-5">
        <p className="sr-only">
          Evidence diagram: booking {snapshot?.booking.value ?? caseData.booking.value}, fulfillment{' '}
          {snapshot?.fulfillment.value ?? caseData.fulfillment.value}, PayPal{' '}
          {snapshot?.paypal.value ?? caseData.paypal.value}.{' '}
          {broken === null
            ? 'All sources agree; the evidence connection is continuous.'
            : broken === 0
              ? 'The connection between booking and fulfillment is broken: payment state is uncertain.'
              : 'The connection between fulfillment and PayPal is broken: these sources disagree.'}
        </p>
        <div className="flex flex-col md:flex-row md:items-stretch">
          <TruthCard fact={caseData.booking} override={snapshot?.booking} onViewSource={setDrawerFact} />
          <ProofConnector broken={broken === 0} />
          <TruthCard fact={caseData.fulfillment} override={snapshot?.fulfillment} onViewSource={setDrawerFact} />
          <ProofConnector broken={broken === 1} />
          <TruthCard fact={caseData.paypal} override={snapshot?.paypal} onViewSource={setDrawerFact} />
        </div>
      </section>

      {actionError && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg bg-failure-bg p-3 text-sm text-failure">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {actionError}
        </p>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <div className="flex flex-col gap-5">
          {!replaying && (
            <>
              <AnalysisPanel
                caseData={caseData}
                analyzing={pending === 'analyze'}
                onAnalyze={() => run('analyze', () => apiPost(`/api/recovery/cases/${caseId}/analyze`))}
              />
              <RecoveryPreview caseData={caseData} onExecute={execute} executing={pending === 'execute'} />
            </>
          )}
          {replaying && <EvidenceReceipt caseData={caseData} />}
        </div>
        <div className="flex flex-col gap-5">
        {!replaying && (
          <>
            <FaultLab
              caseData={caseData}
              arming={pending === 'arm'}
              onArm={() => run('arm', () => apiPost(`/api/recovery/cases/${caseId}/fault`))}
            />
            {caseData.operation && (
              <OperationProgress
                operation={caseData.operation}
                canReconcile={caseData.can.reconcile}
                reconciling={pending === 'reconcile'}
                onReconcile={() => run('reconcile', () => apiPost(`/api/recovery/cases/${caseId}/reconcile`))}
              />
            )}
          </>
        )}
        {!replaying && <EvidenceReceipt caseData={caseData} />}
        {caseData.events.length > 0 && (
          <ReplayStepper events={caseData.events} activeIndex={replayIndex} onSelect={setReplayIndex} />
        )}
        </div>
      </div>

      {!replaying && caseData.preview && caseData.can.execute && (
        <div data-sticky-action className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          <ExecuteButton label={caseData.preview.actionLabel} onClick={execute} pending={pending === 'execute'} />
        </div>
      )}

      <EvidenceDrawer fact={drawerFact} onClose={() => setDrawerFact(null)} />
    </div>
  )
}

function CaseSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 pt-6 md:px-8 md:pt-10" aria-busy="true" aria-label="Loading case">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-subdued" />
      <div className="mt-6 flex flex-col gap-4 md:flex-row">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 flex-1 animate-pulse rounded-xl bg-surface-subdued" />
        ))}
      </div>
    </div>
  )
}
