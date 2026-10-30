import { NextResponse } from 'next/server'
import { route, AppError } from '@/lib/http'
import { assertSameOrigin, createSession, getSession, sessionCookie } from '@/lib/domain/session'

export const dynamic = 'force-dynamic'

export const GET = route(async (req: Request) => {
  const s = await getSession(req)
  if (!s) throw new AppError(401, 'SESSION_REQUIRED')
  return NextResponse.json({ workspaceId: s.workspaceId, csrfToken: s.csrfToken })
})

export const POST = route(async (req: Request) => {
  assertSameOrigin(req)
  const existing = await getSession(req)
  if (existing) return NextResponse.json({ workspaceId: existing.workspaceId, csrfToken: existing.csrfToken })
  const { token, ctx } = await createSession()
  const res = NextResponse.json({ workspaceId: ctx.workspaceId, csrfToken: ctx.csrfToken }, { status: 201 })
  res.headers.set('Set-Cookie', sessionCookie(token))
  return res
})
