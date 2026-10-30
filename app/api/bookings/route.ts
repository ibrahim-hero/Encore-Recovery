import { NextResponse } from 'next/server'
import { z } from 'zod'
import { route } from '@/lib/http'
import { createSampleBooking } from '@/lib/domain/bookings'
import { listBookings } from '@/lib/domain/projections'
import { requireSession } from '@/lib/domain/session'
import { BOOKING_TEMPLATES } from '@/lib/db/seed'

export const dynamic = 'force-dynamic'

export const GET = route(async (req: Request) => {
  const s = await requireSession(req, { mutation: false })
  return NextResponse.json({
    bookings: await listBookings(s.workspaceId),
    templates: BOOKING_TEMPLATES.map((t) => ({ slug: t.slug, title: t.title, amountCents: t.amountCents })),
  })
})

const body = z.object({ template: z.string().max(64) }).strict()

export const POST = route(async (req: Request) => {
  const s = await requireSession(req, { mutation: true })
  const { template } = body.parse(await req.json())
  return NextResponse.json(await createSampleBooking(s.workspaceId, template), { status: 201 })
})
