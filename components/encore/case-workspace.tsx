'use client'

import { useState } from 'react'
import type { RecoveryCase, TruthFact } from '@/lib/fixtures'
import { formatMoney } from '@/lib/money'
import { TruthCard, ProofConnector } from './truth-card'
import { MismatchRibbon } from './mismatch-ribbon'
import { RecoveryPreview, OperationProgress, ExecuteButton } from './recovery-preview'
import { EvidenceReceipt } from './evidence-receipt'
import { ReplayStepper } from './replay-stepper'
import { EvidenceDrawer } from './evidence-drawer'
import { StatusChip } from './status-chip'

// The Proof Canvas case workspace (plan sections 19-23). One selected case,
// one obvious next action, evidence on demand. Replay re-renders immutable
// snapshots with financial actions removed.
export function CaseWorkspace({ caseData }: { caseData: RecoveryCase }) {
  const [drawerFact, setDrawerFact] = useState<TruthFact | null>(null)
  const [replayIndex, setReplayIndex] = useState<number | null>(null)

  const replaying = replayIndex !== null && caseData.snapshots.length > 0
  const snapshot = replaying
    ? caseData.snapshots.find((s) => s.eventId === caseData.events[replayIndex].id)
    : undefined

  const resolved = caseData.status === 'RESOLVED'
  const broken = replaying
    ? snapshot?.paypal.tone !== 'confirmed' || snapshot?.fulfillment.tone === 'failure'
      ? 1
      : null
    : caseData.brokenSegment

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:pb-12 md:pt-8">
      {/* Case header: code, sandbox badge, latest sync (section 20). */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-ink-muted">CASE</p>
          <h1 className="tnum text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            Case {caseData.code}
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">{caseData.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip tone="attention">SANDBOX</StatusChip>
          <span className="text-xs text-ink-muted">Synced {caseData.updatedAt}</span>
        </div>
      </header>

      {/* Attention strip states the mismatch in one sentence. */}
      <div className="mt-5">
        {resolved ? (
          <MismatchRibbon
            resolved
            headline="PayPal confirmed the refund"
            body="The recorded payment and resolution now agree."
          />
        ) : caseData.mismatch ? (
          <MismatchRibbon headline={caseData.mismatch.headline} body={caseData.mismatch.body} />
        ) : null}
      </div>

      {/* Proof Canvas: three source-of-truth cards joined by the evidence
          connector. The broken segment identifies the disagreement. */}
      <section aria-label="Proof canvas" className="mt-5">
        <p className="sr-only">
          Evidence diagram: booking {snapshot?.booking.value ?? caseData.booking.value}, fulfillment{' '}
          {snapshot?.fulfillment.value ?? caseData.fulfillment.value}, PayPal{' '}
          {snapshot?.paypal.value ?? caseData.paypal.value}.{' '}
          {broken === null
            ? 'All sources agree; the evidence connection is continuous.'
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

      {/* Lower area: preview, operation progress, or receipt. Financial
          actions are absent while replay is active (section 21). */}
      <div className="mt-5 space-y-5">
        {!replaying && caseData.preview && <RecoveryPreview caseData={caseData} />}
        {!replaying && caseData.operation && <OperationProgress operation={caseData.operation} />}
        {caseData.receipt && <EvidenceReceipt caseData={caseData} />}
        {caseData.events.length > 0 && (
          <ReplayStepper events={caseData.events} activeIndex={replayIndex} onSelect={setReplayIndex} />
        )}
      </div>

      {/* Sticky mobile action with safe-area padding (section 22). */}
      {!replaying && caseData.preview && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          <ExecuteButton label={caseData.preview.actionLabel} />
        </div>
      )}

      <EvidenceDrawer fact={drawerFact} onClose={() => setDrawerFact(null)} />
    </div>
  )
}
