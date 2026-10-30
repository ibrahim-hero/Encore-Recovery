import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { listReceipts } from '@/lib/domain/projections'
import { requireSession } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

export const GET = route(async (req: Request) => {
  const s = await requireSession(req, { mutation: false })
  return NextResponse.json({ receipts: await listReceipts(s.workspaceId) })
})
