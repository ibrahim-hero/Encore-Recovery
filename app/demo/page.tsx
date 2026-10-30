import Link from 'next/link'
import { CheckCircle2, Circle, ArrowRight, FlaskConical } from 'lucide-react'
import { AppRail } from '@/components/encore/app-rail'
import { StatusChip } from '@/components/encore/status-chip'

// Demo setup: configuration status, sample booking creation, PayPal approval
// action, cancellation handling, and progress (plan section 23).
const steps = [
  {
    done: true,
    title: 'Configuration verified',
    body: 'PayPal Sandbox credentials present, expected merchant and currency pinned, webhook listener registered.',
  },
  {
    done: true,
    title: 'Sample booking created',
    body: 'Booking EN-1042 — Community presentation, $54.00 USD. A demonstration record with no fake provider IDs.',
  },
  {
    done: false,
    title: 'Buyer approval on PayPal Sandbox',
    body: 'Approve the order as a sandbox buyer on PayPal\u2019s hosted page, then return. Cancellation is handled and creates no captured amount.',
  },
  {
    done: false,
    title: 'Simulate merchant failure',
    body: 'Mark the booking merchant-confirmed unfulfillable. The failure is a labeled simulation; payment calls stay real.',
  },
  {
    done: false,
    title: 'Analyze and execute recovery',
    body: 'Run the AI diagnosis, review the validated plan, and issue the sandbox refund with idempotency protection.',
  },
]

export default function DemoPage() {
  return (
    <div className="min-h-screen md:flex">
      <AppRail active="/demo" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                Guided sandbox demo
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Walk the full recovery journey against PayPal Sandbox with fresh scenario IDs.
              </p>
            </div>
            <StatusChip tone="attention">SANDBOX</StatusChip>
          </header>

          <section aria-label="Integration status" className="mt-6 rounded-xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold text-ink">Integration status</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'PayPal Sandbox', value: 'Configured · reachable', ok: true },
                { label: 'Webhook listener', value: 'Registered', ok: true },
                { label: 'AI diagnosis', value: 'Model configured', ok: true },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-surface-subdued px-3 py-2.5">
                  <dt className="text-xs text-ink-muted">{s.label}</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                    <CheckCircle2 aria-hidden className="size-3.5 text-confirmed" />
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-ink-muted">
              Status shows configuration and reachability only — never secrets. Last checked 14:09:55
              UTC.
            </p>
          </section>

          <ol className="mt-6 space-y-3">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4"
              >
                {step.done ? (
                  <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-confirmed" />
                ) : (
                  <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-line" />
                )}
                <div>
                  <p className="text-sm font-semibold text-ink">
                    <span className="tnum mr-1.5 text-ink-muted">{i + 1}.</span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/case/en-1042"
              className="flex min-h-11 items-center gap-2 rounded-lg bg-action px-5 text-sm font-semibold text-surface transition-colors hover:bg-action-hover"
            >
              <FlaskConical aria-hidden className="size-4" />
              Continue to case EN-1042
              <ArrowRight aria-hidden className="size-4" />
            </Link>
            <button
              type="button"
              className="flex min-h-11 items-center rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-subdued"
            >
              Start new scenario
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            A new scenario creates fresh IDs and preserves previous unresolved operations. There is
            no global database reset in the hosted demo.
          </p>
        </div>
      </main>
    </div>
  )
}
