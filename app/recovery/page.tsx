import { AppRail } from '@/components/encore/app-rail'
import { LiveQueue } from '@/components/encore/live-queue'

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
            <LiveQueue />
          </div>
        </div>
      </main>
    </div>
  )
}
