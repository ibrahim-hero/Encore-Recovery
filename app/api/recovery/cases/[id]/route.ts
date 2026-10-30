import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { getCaseView } from '@/lib/domain/projections'
import { requireSession } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await requireSession(req, { mutation: false })
  const { id } = await params
  return NextResponse.json(await getCaseView(s.workspaceId, id))
})
