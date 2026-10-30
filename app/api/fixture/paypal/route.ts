import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isSandbox } from '@/lib/config'
import { AppError, route } from '@/lib/http'
import { fakeProvider } from '@/lib/paypal/fake'

export const dynamic = 'force-dynamic'

const body = z.object({ token: z.string().min(1).max(64), action: z.enum(['approve', 'cancel']) }).strict()

// Stands in for PayPal's hosted approval page in fixture mode only.
export const POST = route(async (req: Request) => {
  if (isSandbox()) throw new AppError(404, 'NOT_FOUND')
  const { token, action } = body.parse(await req.json())
  const redirectUrl =
    action === 'approve' ? (await fakeProvider.approveOrder(token)).returnUrl : await fakeProvider.cancelUrlFor(token)
  return NextResponse.json({ redirectUrl })
})
