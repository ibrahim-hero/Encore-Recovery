import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { handlePayPalWebhook } from '@/lib/domain/webhooks'
import { drainJobs } from '@/lib/jobs/drain'
import { after } from 'next/server'

export const dynamic = 'force-dynamic'

// CSRF-exempt: authenticated by PayPal signature over the raw body.
export const POST = route(async (req: Request) => {
  const raw = await req.text()
  if (raw.length > 256_000) return NextResponse.json({ result: 'TOO_LARGE' }, { status: 413 })
  const { status, result } = await handlePayPalWebhook(req.headers, raw)
  if (result === 'MAPPED') after(() => drainJobs({ max: 5 }).then(() => undefined))
  return NextResponse.json({ result }, { status })
})
