import { Suspense } from 'react'
import { PaymentReturn } from '@/components/encore/payment-return'

export default function ReturnPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4 py-10">
      <Suspense fallback={null}>
        <PaymentReturn />
      </Suspense>
    </main>
  )
}
