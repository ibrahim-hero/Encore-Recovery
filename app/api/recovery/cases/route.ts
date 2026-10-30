import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { listCases } from '@/lib/domain/projections'
import { requireSession } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

export const GET = route(async (req: Request) => {
  const s = await requireSession(req, { mutation: false })
  return NextResponse.json({ cases: await listCases(s.workspaceId) })
})
