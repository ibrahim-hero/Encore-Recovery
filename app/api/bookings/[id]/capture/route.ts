import { NextResponse } from 'next/server'
import { z } from 'zod'
import { route } from '@/lib/http'
import { completeCapture } from '@/lib/domain/bookings'
import { requireSession } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

const body = z.object({ orderToken: z.string().min(1).max(64), returnNonce: z.string().min(1).max(64) }).strict()

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, { mutation: true })
  const { id } = await params
  return NextResponse.json(await completeCapture(s.workspaceId, id, body.parse(await req.json())))
})
