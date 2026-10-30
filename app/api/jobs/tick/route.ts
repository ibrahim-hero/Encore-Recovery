import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { requireSession } from '@/lib/domain/session'
import { drainJobs } from '@/lib/jobs/drain'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Preview substitute for the Render worker: drains only this workspace's due jobs.
export const POST = route(async (req: Request) => {
  const s = await requireSession(req, { mutation: true })
  const processed = await drainJobs({ workspaceId: s.workspaceId, max: 5 })
  return NextResponse.json({ processed })
})
