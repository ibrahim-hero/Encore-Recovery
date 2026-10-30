import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { startCheckout } from '@/lib/domain/bookings'
import { publicOrigin, requireSession } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, { mutation: true })
  const { id } = await params
  return NextResponse.json(await startCheckout(s.workspaceId, id, publicOrigin(req)))
})
