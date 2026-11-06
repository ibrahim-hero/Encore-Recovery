'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import useSWRImmutable from 'swr/immutable'
import { CheckCircle2, Loader2, XCircle, Clock } from 'lucide-react'
import { apiPost, ApiError } from '@/lib/client/api'

type Outcome = { state: 'COMPLETED' | 'PENDING' | 'UNKNOWN' | 'FAILED' | 'REVIEW_REQUIRED' | 'CANCELLED' }

// Addendum C.5: the GET render has no side effect. The client posts the
// capture (or cancellation) once; the server is idempotent on reload.
export function PaymentReturn() {
  const params = useSearchParams()
  const bookingId = params.get('b')
  const nonce = params.get('n')
  const token = params.get('token')
  const cancelled = params.get('cancel') === '1'
  const valid = !!(bookingId && nonce && token)

  const { data, error, isLoading, mutate } = useSWRImmutable<Outcome>(
    valid ? ['return', bookingId, token, cancelled] : null,
    async () => {
      const body = { orderToken: token, returnNonce: nonce }
      if (cancelled) {
        await apiPost(`/api/bookings/${bookingId}/cancel-payment`, body)
        return { state: 'CANCELLED' }
      }
      return apiPost<Outcome>(`/api/bookings/${bookingId}/capture`, body)
    },
    { shouldRetryOnError: false },
  )

  if (!valid) return <Panel icon="failure" title="Invalid return link" body="This page expects a PayPal return with a booking and order token." />
  if (isLoading) return <Panel icon="loading" title={cancelled ? 'Recording cancellation' : 'Confirming your payment'} body="Verifying the capture directly with the provider." />
  if (error) {
    return (
      <Panel
        icon="failure"
        title="Payment not confirmed"
        body={error instanceof ApiError ? `${error.code}: ${error.message}` : 'Something went wrong.'}
        onRetry={() => mutate()}
      />
    )
  }

  const copy: Record<Outcome['state'], { icon: PanelIcon; title: string; body: string }> = {
    COMPLETED: { icon: 'confirmed', title: 'Payment captured and verified', body: 'The capture was confirmed COMPLETED by a direct read with matching amount, currency, and payee.' },
    PENDING: { icon: 'pending', title: 'Payment pending', body: 'The provider reports the capture as pending. It will not be treated as paid until it completes.' },
    UNKNOWN: { icon: 'pending', title: 'Payment outcome unknown', body: 'The capture response did not arrive. Retrying uses the same request ID and cannot charge twice.' },
    FAILED: { icon: 'failure', title: 'Payment failed', body: 'The provider rejected the capture. No amount was taken.' },
    REVIEW_REQUIRED: { icon: 'failure', title: 'Payment needs review', body: 'The capture facts did not fully match the booking.' },
    CANCELLED: { icon: 'pending', title: 'Payment cancelled', body: 'No amount was captured. You can start a new payment for this booking.' },
  }
  const c = copy[data!.state]
  return <Panel {...c} onRetry={data!.state === 'UNKNOWN' ? () => mutate() : undefined} />
}

type PanelIcon = 'loading' | 'confirmed' | 'pending' | 'failure'

function Panel({ icon, title, body, onRetry }: { icon: PanelIcon; title: string; body: string; onRetry?: () => void }) {
  const Icon = { loading: Loader2, confirmed: CheckCircle2, pending: Clock, failure: XCircle }[icon]
  const tone = { loading: 'text-ink-muted', confirmed: 'text-confirmed', pending: 'text-attention', failure: 'text-failure' }[icon]
  return (
    <section aria-live="polite" className="rounded-lg border border-line bg-surface p-6 text-center">
      <Icon aria-hidden className={`mx-auto size-8 ${tone} ${icon === 'loading' ? 'animate-spin' : ''}`} />
      <h1 className="mt-3 text-xl font-semibold text-ink text-balance">{title}</h1>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink-muted text-pretty">{body}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-ink hover:bg-surface-subdued"
          >
            Retry confirmation
          </button>
        )}
        {icon !== 'loading' && (
          <Link
            href="/demo"
            className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-semibold text-surface hover:bg-action-hover"
          >
            Back to demo setup
          </Link>
        )}
      </div>
    </section>
  )
}
