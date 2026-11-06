import Link from 'next/link'
import { ArrowRight, ShieldCheck, Eye, FlaskConical } from 'lucide-react'
import { Wordmark, ReconnectGlyph } from '@/components/encore/wordmark'
import { HeroProof } from '@/components/encore/hero-proof'

// Product entry: brief explanation, Start guided sandbox demo, View how it
// works, and a visible sandbox purpose (plan section 23).
export default function EntryPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-6 md:px-10">
      <header className="flex items-center justify-between">
        <Wordmark />
        <span className="rounded-full bg-attention-bg px-3 py-1 text-xs font-semibold text-attention">
          SANDBOX
        </span>
      </header>

      <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <div className="flex flex-col">
        <ReconnectGlyph className="h-2 w-12" />
        <h1 className="mt-6 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-ink md:text-5xl">
          When a booking is paid but can&apos;t be fulfilled, prove it — then refund it.
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-ink-body">
          Encore Recovery reconciles three sources of truth — the booking, merchant fulfillment, and
          PayPal money — diagnoses the disagreement, and executes a verified, idempotent refund with
          an immutable evidence receipt.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/demo"
            className="flex min-h-11 items-center gap-2 rounded-lg bg-action px-5 text-sm font-semibold text-surface transition-colors hover:bg-action-hover"
          >
            <FlaskConical aria-hidden className="size-4" />
            Start guided sandbox demo
          </Link>
          <Link
            href="/recovery"
            className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-subdued"
          >
            <Eye aria-hidden className="size-4" />
            View how it works
          </Link>
        </div>

        <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-muted">
          This demonstration runs entirely against PayPal Sandbox. No real money moves; every
          payment and refund fact is a verified sandbox read, and the merchant failure is a labeled
          simulation.
        </p>
        </div>
        <HeroProof />
      </div>

      <footer className="grid gap-3 border-t border-line pt-6 sm:grid-cols-3">
        {[
          {
            icon: ShieldCheck,
            title: 'Verified, never assumed',
            body: 'Paid and refunded states come only from direct provider reads.',
          },
          {
            icon: ArrowRight,
            title: 'One next action',
            body: 'Each case presents a single validated action with its exact reason.',
          },
          {
            icon: Eye,
            title: 'Evidence on demand',
            body: 'Structured facts, observation times, and a replayable record.',
          },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-surface p-4">
            <f.icon aria-hidden className="size-4 text-action" />
            <h2 className="mt-2 text-sm font-semibold text-ink">{f.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{f.body}</p>
          </div>
        ))}
      </footer>
    </main>
  )
}
