import { AppRail } from '@/components/encore/app-rail'
import { ReceiptsList } from '@/components/encore/receipts-list'

export default function ReceiptsPage() {
  return (
    <div className="min-h-screen md:flex">
      <AppRail active="/receipts" />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1760px] px-4 md:px-8 py-6 md:py-10">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">Receipts</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Immutable as-of evidence receipts generated only after a verified matching completion.
            </p>
          </header>
          <ReceiptsList />
        </div>
      </main>
    </div>
  )
}
