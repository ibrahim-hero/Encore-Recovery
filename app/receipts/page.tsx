import Link from 'next/link'
import { ReceiptText, BadgeCheck } from 'lucide-react'
import { AppRail } from '@/components/encore/app-rail'
import { fixtureCases } from '@/lib/fixtures'
import { formatMoney } from '@/lib/money'

export default function ReceiptsPage() {
  const receipts = fixtureCases.filter((c) => c.receipt)

  return (
    <div className="min-h-screen md:flex">
      <AppRail active="/receipts" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Receipts</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Immutable as-of evidence receipts generated only after a verified matching completion.
            </p>
          </header>

          {receipts.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
              <ReceiptText aria-hidden className="size-6 text-ink-muted" />
              <p className="mt-3 text-sm font-medium text-ink">No receipts yet</p>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
                A receipt appears when PayPal confirms a refund and Encore verifies it with a direct
                read.
              </p>
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {receipts.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/case/${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-subdued/50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="tnum text-base font-semibold text-ink">{c.code}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-confirmed-bg px-2.5 py-1 text-xs font-medium text-confirmed">
                          <BadgeCheck aria-hidden className="size-3.5" />
                          Verified against PayPal Sandbox
                        </span>
                      </div>
                      <p className="tnum mt-1 text-xs text-ink-muted">
                        Refund {c.receipt!.refundId} · v{c.receipt!.version} ·{' '}
                        {c.receipt!.generatedAt}
                      </p>
                    </div>
                    <p className="tnum text-xl font-semibold text-ink">
                      {formatMoney(c.receipt!.refundCents, c.currency)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
