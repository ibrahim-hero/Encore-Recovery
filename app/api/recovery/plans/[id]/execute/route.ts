import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { executePlan } from '@/lib/domain/execute'
import { requireSession } from '@/lib/domain/session'
import { kickWorker } from '@/lib/kick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, { mutation: true })
  const { id } = await params
  const out = await executePlan(s.workspaceId, id)
  kickWorker(s.workspaceId)
  return NextResponse.json(out, { status: out.existing ? 200 : 202 })
})
