import { AppRail } from '@/components/encore/app-rail'
import { DemoSetup } from '@/components/encore/demo-setup'

// Demo setup: configuration status, sample booking creation, PayPal approval,
// cancellation handling, and the labeled merchant-failure simulation (section 23).
export default function DemoPage() {
  return (
    <div className="min-h-screen md:flex">
      <AppRail active="/demo" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Demo setup</h1>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              Create a booking, pay for it, simulate a merchant failure, then resolve the case with a verified refund.
            </p>
          </header>
          <div className="mt-6">
            <DemoSetup />
          </div>
        </div>
      </main>
    </div>
  )
}
