import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { route, requestOrigin } from '@/lib/http'
import { startCheckout } from '@/lib/domain/bookings'
import { requireSession } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, { mutation: true })
  const { id } = await params
  const origin = getConfig().APP_ORIGIN ?? requestOrigin(req)
  return NextResponse.json(await startCheckout(s.workspaceId, id, origin))
})
