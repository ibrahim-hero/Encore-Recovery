'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FlaskConical, Loader2 } from 'lucide-react'

// Stand-in for PayPal's hosted approval page in fixture mode. Clearly labeled;
// the real Sandbox flow redirects to www.sandbox.paypal.com instead.
export function FixtureApproval() {
  const token = useSearchParams().get('token')
  const [pending, setPending] = useState<'approve' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function go(action: 'approve' | 'cancel') {
    if (!token) return
    setPending(action)
    setError(null)
    const res = await fetch('/api/fixture/paypal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    })
    if (!res.ok) {
      setError('This order could not be found.')
      setPending(null)
      return
    }
    const { redirectUrl } = (await res.json()) as { redirectUrl: string }
    window.location.assign(redirectUrl)
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-surface-subdued px-2.5 py-1 text-xs font-medium text-link">
        <FlaskConical aria-hidden className="size-3.5" />
        Simulated provider approval (fixture mode)
      </p>
      <h1 className="mt-3 text-xl font-semibold text-ink">Approve payment</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        In Sandbox mode this step happens on PayPal&apos;s hosted page with a sandbox buyer account.
      </p>
      <p className="tnum mt-3 text-xs text-ink-muted">Order {token ?? 'missing'}</p>
      {error && <p role="alert" className="mt-3 text-sm text-failure">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => go('approve')}
          disabled={!token || pending !== null}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-5 text-sm font-semibold text-surface hover:bg-action-hover disabled:opacity-60"
        >
          {pending === 'approve' && <Loader2 aria-hidden className="size-4 animate-spin" />}
          Approve as test buyer
        </button>
        <button
          type="button"
          onClick={() => go('cancel')}
          disabled={!token || pending !== null}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-5 text-sm font-medium text-ink hover:bg-surface-subdued disabled:opacity-60"
        >
          {pending === 'cancel' && <Loader2 aria-hidden className="size-4 animate-spin" />}
          Cancel and return
        </button>
      </div>
    </section>
  )
}
