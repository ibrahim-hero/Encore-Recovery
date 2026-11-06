import Link from 'next/link'
import { ArrowRight, ShieldCheck, Eye, Repeat2, FlaskConical } from 'lucide-react'
import { Wordmark } from '@/components/encore/wordmark'
import { HeroProof } from '@/components/encore/hero-proof'

const principles = [
  {
    icon: ShieldCheck,
    title: 'Verified, never assumed',
    body: 'Paid and refunded states come only from direct PayPal reads and verified webhooks, never from local guesses.',
  },
  {
    icon: Repeat2,
    title: 'One refund, however it fails',
    body: 'A durable outbox and a stable request key make a lost response recoverable without a second refund.',
  },
  {
    icon: Eye,
    title: 'Evidence on demand',
    body: 'Every case ends in an immutable receipt with observed facts, timestamps, and a replayable event record.',
  },
]

const steps = [
  ['Book and pay', 'A real PayPal Sandbox order is captured.'],
  ['Merchant fails', 'The venue cannot fulfill; the failure is a labeled simulation.'],
  ['Diagnose', 'AI proposes one action; rules decide if it is eligible.'],
  ['Refund and prove', 'The refund executes once and produces the receipt.'],
]

export default function EntryPage() {
  return (
    <main className="min-h-screen bg-canvas">
      <section className="bg-ink text-surface">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col px-4 pb-16 pt-6 md:px-10 md:pb-24">
          <header className="flex items-center justify-between">
            <Wordmark tone="light" />
            <span className="rounded-sm bg-attention-bg px-2.5 py-1 text-[10px] font-bold tracking-widest text-attention">
              SANDBOX
            </span>
          </header>

          <div className="grid items-center gap-12 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:pt-24">
            <div className="flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-surface/60">
                Merchant refund recovery for PayPal
              </p>
              <h1 className="mt-5 max-w-3xl text-balance text-4xl font-extrabold leading-[1.05] text-surface md:text-6xl">
                Paid, but can&apos;t be fulfilled? Prove it, then refund it once.
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-surface/75">
                Encore Recovery reconciles the booking, the merchant&apos;s fulfillment, and the PayPal money. It diagnoses the
                disagreement, runs one verified, idempotent refund, and seals the result in an evidence receipt.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/demo"
                  className="inline-flex min-h-12 items-center gap-2 rounded-md bg-action px-5 text-sm font-semibold text-surface transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface"
                >
                  <FlaskConical aria-hidden className="size-4" />
                  Start guided sandbox demo
                </Link>
                <a
                  href="#how"
                  className="inline-flex min-h-12 items-center gap-2 rounded-md border border-surface/30 px-5 text-sm font-semibold text-surface transition-colors hover:bg-surface/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface"
                >
                  How it works
                  <ArrowRight aria-hidden className="size-4" />
                </a>
              </div>
              <p className="mt-8 max-w-xl text-sm leading-relaxed text-surface/60">
                Runs entirely against PayPal Sandbox. No real money moves, and the merchant failure is a labeled simulation.
              </p>
            </div>
            <HeroProof />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1600px] px-4 py-16 md:px-10 md:py-24">
        <div className="grid gap-10 md:grid-cols-3 md:gap-12">
          {principles.map((p) => (
            <div key={p.title} className="border-t-2 border-ink pt-5">
              <p.icon aria-hidden className="size-5 text-action" />
              <h2 className="mt-4 text-xl font-bold text-ink">{p.title}</h2>
              <p className="mt-2 max-w-sm text-pretty leading-relaxed text-ink-body">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-16 md:px-10 md:py-24">
          <h2 className="text-3xl font-extrabold text-ink md:text-4xl">From failure to receipt in four steps</h2>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
            {steps.map(([title, body], i) => (
              <li key={title} className="flex flex-col gap-2 bg-surface p-6">
                <span className="tnum text-sm font-bold text-action">Step {i + 1}</span>
                <span className="text-lg font-bold text-ink">{title}</span>
                <span className="text-pretty leading-relaxed text-ink-body">{body}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  )
}
