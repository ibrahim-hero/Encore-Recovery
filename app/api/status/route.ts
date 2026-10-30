import { NextResponse } from 'next/server'
import { route } from '@/lib/http'
import { getSystemStatus } from '@/lib/domain/projections'

export const dynamic = 'force-dynamic'

export const GET = route(async () => NextResponse.json(await getSystemStatus()))
