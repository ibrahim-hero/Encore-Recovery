import { AppRail } from '@/components/encore/app-rail'
import { RecoveryWorkspace } from '@/components/encore/studio/recovery-workspace'

export default function RecoveryPage() {
  // AG licence keys are designed to ship to the browser; reading it here keeps it configurable per deployment.
  // V2 exists because the v0 env form cannot re-prompt an existing variable when the key is rotated.
  const licenseKey = process.env.AG_STUDIO_LICENSE_KEY_V2 ?? process.env.AG_STUDIO_LICENSE_KEY
  return (
    <div className="min-h-screen md:flex">
      <AppRail active="/recovery" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:py-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Recovery</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Cases where a paid booking and its fulfillment disagree. Amounts are verified
              projections, not local state.
            </p>
          </header>
          <div className="mt-6">
            <RecoveryWorkspace licenseKey={licenseKey} />
          </div>
        </div>
      </main>
    </div>
  )
}
