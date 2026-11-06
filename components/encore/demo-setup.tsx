'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, CircleDashed, Loader2, Plus, AlertTriangle } from 'lucide-react'
import { apiPost, useApi, ApiError } from '@/lib/client/api'
import { formatMoney } from '@/lib/money'
import type { BookingSummary, SystemStatus } from '@/lib/view-types'
import { StatusChip } from './status-chip'

type BookingsResponse = {
  bookings: BookingSummary[]
  templates: { slug: string; title: string; amountCents: number }[]
}

const paymentChip: Record<string, { tone: 'confirmed' | 'attention' | 'failure' | 'neutral'; label: string }> = {
  NOT_STARTED: { tone: 'neutral', label: 'Awaiting payment' },
  AWAITING_BUYER: { tone: 'attention', label: 'Awaiting buyer' },
  CAPTURING: { tone: 'attention', label: 'Capturing' },
  UNKNOWN: { tone: 'attention', label: 'Payment unknown' },
  PENDING: { tone: 'attention', label: 'Payment pending' },
  COMPLETED: { tone: 'confirmed', label: 'Paid' },
  FAILED: { tone: 'failure', label: 'Payment failed' },
  REVIEW_REQUIRED: { tone: 'failure', label: 'Needs review' },
}

function openApproval(url: string, sandbox: boolean) {
  // PayPal's hosted page cannot render inside the preview iframe.
  if (sandbox && window.self !== window.top) window.open(url, '_blank', 'noopener')
  else window.location.assign(url)
}

export function DemoSetup() {
  const router = useRouter()
  const { data: status } = useApi<SystemStatus>('/api/status')
  const { data, error, mutate } = useApi<BookingsResponse>('/api/bookings')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const sandbox = status?.mode === 'SANDBOX'
  const providerName = sandbox ? 'PayPal Sandbox' : 'fixture PayPal'

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setMessage(null)
    try {
      await fn()
    } catch (err) {
      setMessage(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Something went wrong.')
    } finally {
      setBusy(null)
      mutate()
    }
  }

  const createBooking = (slug: string) =>
    act(`create:${slug}`, async () => {
      await apiPost('/api/bookings', { template: slug })
    })

  const pay = (b: BookingSummary) =>
    act(`pay:${b.id}`, async () => {
      const { approveUrl } = await apiPost<{ approveUrl: string }>(`/api/bookings/${b.id}/checkout`)
      openApproval(approveUrl, sandbox)
    })

  const fail = (b: BookingSummary) =>
    act(`fail:${b.id}`, async () => {
      const { caseId } = await apiPost<{ caseId: string }>(`/api/bookings/${b.id}/merchant-failure`, {
        reason: 'Venue closed unexpectedly; the merchant cannot provide this booking.',
      })
      router.push(`/case/${caseId}`)
    })

  return (
    <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:items-start xl:gap-x-10">
      <section aria-labelledby="config-heading" className="xl:col-start-1 rounded-lg border border-line bg-surface p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="config-heading" className="text-sm font-semibold tracking-wide text-ink">
            Configuration
          </h2>
          {status && <StatusChip tone={sandbox ? 'attention' : 'info'}>{status.mode}</StatusChip>}
        </div>
        {!status ? (
          <div className="mt-3 h-16 animate-pulse rounded-lg bg-surface-subdued" />
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <ConfigRow label="Payments" ok={sandbox} value={sandbox ? 'PayPal Sandbox (live API)' : 'Fixture PayPal (realistic fake)'} />
              <ConfigRow label="Database" ok={status.database === 'pg'} value={status.database === 'pg' ? 'Postgres' : 'Embedded Postgres (PGlite)'} />
              <ConfigRow label="AI model" ok value={status.aiModel} />
              <ConfigRow label="Webhooks" ok={status.webhookConfigured} value={status.webhookConfigured ? 'Listener configured' : 'Not configured (polling only)'} />
            </dl>
            {!sandbox && (
              <p className="mt-3 rounded-lg bg-surface-subdued p-3 text-sm leading-relaxed text-ink-body">
                Fixture mode: every state transition, idempotency key, and verification runs for real against a
                deterministic fake provider. Results are labeled fixture and never presented as live. Add{' '}
                <span className="tnum font-medium">{status.missing.join(', ')}</span> and set{' '}
                <span className="tnum font-medium">APP_MODE=sandbox</span> to switch to PayPal Sandbox.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="create-heading" className="xl:col-start-1">
        <h2 id="create-heading" className="text-sm font-semibold tracking-wide text-ink">
          Create a demonstration booking
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Each scenario gets new booking, order, and operation IDs.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data?.templates.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => createBooking(t.slug)}
              disabled={busy !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-subdued focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60"
            >
              {busy === `create:${t.slug}` ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
              {t.title}
              <span className="tnum text-ink-muted">{formatMoney(t.amountCents, 'USD')}</span>
            </button>
          ))}
        </div>
      </section>

      {message && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-failure-bg p-3 text-sm text-failure xl:col-start-1">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {message}
        </p>
      )}

      <section aria-labelledby="bookings-heading" className="xl:col-start-2 xl:row-span-3 xl:row-start-1">
        <h2 id="bookings-heading" className="text-sm font-semibold tracking-wide text-ink">
          Bookings in this workspace
        </h2>
        {error && !data ? (
          <p className="mt-3 text-sm text-failure">Could not load bookings.</p>
        ) : !data ? (
          <div className="mt-3 h-20 animate-pulse rounded-lg bg-surface-subdued" />
        ) : data.bookings.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">
            No bookings yet. Create one above to start the flow.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {data.bookings.map((b) => {
              const chip = paymentChip[b.paymentState] ?? { tone: 'neutral' as const, label: b.paymentState }
              const canPay = b.paymentState === 'NOT_STARTED' || b.paymentState === 'AWAITING_BUYER'
              const canFail = b.paymentState === 'COMPLETED' && b.fulfillmentState === 'SCHEDULED'
              return (
                <li key={b.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum text-base font-semibold text-ink">{b.code}</span>
                      <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                      {b.fulfillmentState === 'UNFULFILLABLE' && <StatusChip tone="failure">Cannot fulfill</StatusChip>}
                      {b.fulfillmentState === 'CLOSED' && <StatusChip tone="confirmed">Closed</StatusChip>}
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {b.title} · <span className="tnum">{formatMoney(b.amountCents, b.currency)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canPay && (
                      <ActionButton onClick={() => pay(b)} pending={busy === `pay:${b.id}`} disabled={busy !== null} primary>
                        Pay with {providerName}
                      </ActionButton>
                    )}
                    {canFail && (
                      <ActionButton onClick={() => fail(b)} pending={busy === `fail:${b.id}`} disabled={busy !== null}>
                        Simulate merchant failure
                      </ActionButton>
                    )}
                    {b.caseId && (
                      <Link
                        href={`/case/${b.caseId}`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-link hover:underline"
                      >
                        Open case <ArrowRight aria-hidden className="size-4" />
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function ConfigRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-confirmed" />
      ) : (
        <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      )}
      <div className="min-w-0">
        <dt className="text-xs text-ink-muted">{label}</dt>
        <dd className="tnum break-words font-medium text-ink">{value}</dd>
      </div>
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  pending,
  disabled,
  primary,
}: {
  children: React.ReactNode
  onClick: () => void
  pending: boolean
  disabled: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={pending}
      className={
        primary
          ? 'inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-surface transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60'
          : 'inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-subdued focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60'
      }
    >
      {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  )
}
