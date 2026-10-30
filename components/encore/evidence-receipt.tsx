import { BadgeCheck } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { RecoveryCase } from '@/lib/fixtures'

// Evidence Receipt: immutable as-of summary on a restrained inset paper
// surface with a thin perforation motif and the Encore verification mark.
// The label is exactly "Verified against PayPal Sandbox" — the app's evidence
// label, not PayPal certification (plan section 21).
export function EvidenceReceipt({ caseData }: { caseData: RecoveryCase }) {
  const receipt = caseData.receipt
  if (!receipt) return null

  const rows = [
    { label: 'Original capture', cents: receipt.captureCents, id: receipt.captureId },
    { label: 'Confirmed refund', cents: receipt.refundCents, id: receipt.refundId },
    { label: 'Customer charge remaining', cents: receipt.remainingCents, id: null },
  ]

  return (
    <section aria-labelledby="receipt-heading" className="receipt-paper relative rounded-xl p-5 md:p-6">
      <div className="receipt-perforation absolute inset-x-4 top-0" aria-hidden />

      <header className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h2 id="receipt-heading" className="text-base font-semibold text-ink">
            Evidence Receipt
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Version {receipt.version} · as-of {receipt.observedAt}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-confirmed/30 bg-confirmed-bg px-3 py-1.5 text-xs font-semibold text-confirmed">
          <BadgeCheck aria-hidden className="size-4" />
          Verified against PayPal Sandbox
        </span>
      </header>

      <dl className="mt-5 divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-sm text-ink-body">
              {row.label}
              {row.id && (
                <span className="tnum mt-0.5 block text-xs text-ink-muted">{row.id}</span>
              )}
            </dt>
            <dd className="tnum text-xl font-semibold text-ink">
              {formatMoney(row.cents, caseData.currency)}
            </dd>
          </div>
        ))}
      </dl>

      <footer className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">
        <p>
          Mode: {caseData.mode} · Policy {receipt.policyVersion} · Plan {receipt.planId} · Operation{' '}
          {receipt.operationId}
        </p>
        <p className="mt-1">
          Provider IDs and source timestamps come from runtime records. Generated{' '}
          {receipt.generatedAt}.
        </p>
      </footer>
    </section>
  )
}
