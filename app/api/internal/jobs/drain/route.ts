import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { safeEqualHex, sha256 } from '@/lib/crypto'
import { AppError, route } from '@/lib/http'
import { drainJobs } from '@/lib/jobs/drain'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Addendum C.1 fallback: an external cron can call this when no worker process runs.
export const POST = route(async (req: Request) => {
  const expected = getConfig().INTERNAL_JOB_TOKEN
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!expected || !safeEqualHex(sha256(given), sha256(expected))) {
    throw new AppError(401, 'UNAUTHORIZED')
  }
  const processed = await drainJobs({ workerId: 'drain-route', max: 25 })
  return NextResponse.json({ processed })
})
