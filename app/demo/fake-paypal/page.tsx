import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { isSandbox } from '@/lib/config'
import { FixtureApproval } from '@/components/encore/fixture-approval'

export const dynamic = 'force-dynamic'

export default function FakePayPalPage() {
  if (isSandbox()) notFound()
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <Suspense fallback={null}>
        <FixtureApproval />
      </Suspense>
    </main>
  )
}
