import { AppRail } from '@/components/encore/app-rail'
import { QueueList } from '@/components/encore/queue-list'
import { fixtureCases } from '@/lib/fixtures'

export default function RecoveryPage() {
  return (
    <div className="min-h-screen md:flex">
      <AppRail active="/recovery" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Recovery</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Cases where a paid booking and its fulfillment disagree. Amounts are verified
              projections, not local state.
            </p>
          </header>
          <div className="mt-6">
            <QueueList cases={fixtureCases} />
          </div>
        </div>
      </main>
    </div>
  )
}
