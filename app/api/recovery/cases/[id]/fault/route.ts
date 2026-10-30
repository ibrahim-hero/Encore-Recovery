import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { armFault } from '@/lib/domain/execute'
import { requireSession } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, { mutation: true })
  const { id } = await params
  await armFault(s.workspaceId, id)
  return NextResponse.json({ armed: true })
})
