import { NextResponse } from 'next/server'
import { z } from 'zod'
import { route } from '@/lib/http'
import { simulateMerchantFailure } from '@/lib/domain/bookings'
import { requireSession } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

const body = z.object({ reason: z.string().trim().min(3).max(200) }).strict()

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, { mutation: true })
  const { id } = await params
  const { reason } = body.parse(await req.json())
  return NextResponse.json(await simulateMerchantFailure(s.workspaceId, id, reason), { status: 201 })
})
