import { getConfig } from '@/lib/config'
import { randomToken, safeEqualHex, sha256, uuid } from '@/lib/crypto'
import { getDb } from '@/lib/db/client'
import { AppError, requestOrigin } from '@/lib/http'

export const SESSION_COOKIE = 'encore_session'
export const CSRF_HEADER = 'x-encore-csrf'
const SESSION_DAYS = 30

export type SessionContext = { sessionId: string; workspaceId: string; csrfToken: string }

// The CSRF token is derived from the session token, so the server can hand it
// back on GET without storing plaintext. Cross-site pages cannot read it (C.8).
function csrfFor(sessionToken: string): string {
  return sha256(`csrf:${sessionToken}`).slice(0, 32)
}

export function sessionCookie(token: string): string {
  const c = getConfig()
  // v0 preview renders the app in a cross-site iframe, which needs SameSite=None.
  // Deployed (Render) uses Lax so the PayPal top-level return still carries it (C.5).
  const sameSite = c.deploymentTarget === 'render' ? 'Lax' : 'None'
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${SESSION_DAYS * 86400}`
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

function originOf(value: string | undefined, assumeHttps = false): string | undefined {
  if (!value) return undefined
  try {
    return new URL(assumeHttps && !value.includes('://') ? `https://${value}` : value).origin
  } catch {
    return undefined
  }
}

// Exact origins only, never patterns. The v0 preview serves the app on a public
// URL (V0_RUNTIME_URL) while requests reach the server through the sandbox host.
function trustedOrigins(req: Request): Set<string> {
  const c = getConfig()
  const candidates =
    process.env.NODE_ENV === 'development'
      ? [process.env.V0_RUNTIME_URL, process.env.V0_DEV_APP_URL, process.env.V0_BUILD_URL, process.env.V0_SANDBOX_URL].map(
          (v) => originOf(v),
        )
      : [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].map((v) => originOf(v, true))
  return new Set(
    [requestOrigin(req), originOf(c.APP_ORIGIN), ...candidates].filter((o): o is string => Boolean(o)),
  )
}

function isTrustedOrigin(req: Request, origin: string | null): origin is string {
  if (!origin) return false
  if (trustedOrigins(req).has(origin)) return true
  return getConfig().deploymentTarget === 'local' && origin.startsWith('http://localhost:')
}

export function assertSameOrigin(req: Request): void {
  if (!isTrustedOrigin(req, req.headers.get('origin'))) {
    throw new AppError(403, 'CSRF_INVALID', 'Origin not allowed')
  }
}

/** Origin the buyer's browser is actually on; PayPal must send them back there so their session cookie applies. */
export function publicOrigin(req: Request): string {
  const configured = originOf(getConfig().APP_ORIGIN)
  if (configured) return configured
  const browser = req.headers.get('origin')
  return isTrustedOrigin(req, browser) ? browser : requestOrigin(req)
}

export async function createSession(): Promise<{ token: string; ctx: SessionContext }> {
  const db = await getDb()
  const token = randomToken(24)
  const workspaceId = uuid()
  const sessionId = uuid()
  const csrfToken = csrfFor(token)
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO workspaces (id, label) VALUES ($1, $2)', [workspaceId, 'Demo workspace'])
    await tx.query(
      `INSERT INTO sessions (id, workspace_id, token_hash, csrf_token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '${SESSION_DAYS} days')`,
      [sessionId, workspaceId, sha256(token), sha256(csrfToken)],
    )
  })
  return { token, ctx: { sessionId, workspaceId, csrfToken } }
}

export async function getSession(req: Request): Promise<SessionContext | null> {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return null
  const db = await getDb()
  const { rows } = await db.query<{ id: string; workspace_id: string }>(
    'SELECT id, workspace_id FROM sessions WHERE token_hash = $1 AND expires_at > now()',
    [sha256(token)],
  )
  if (!rows[0]) return null
  return { sessionId: rows[0].id, workspaceId: rows[0].workspace_id, csrfToken: csrfFor(token) }
}

/** Every mutation: valid session + exact Origin + CSRF header matching the stored hash. */
export async function requireSession(req: Request, opts: { mutation: boolean }): Promise<SessionContext> {
  const session = await getSession(req)
  if (!session) throw new AppError(401, 'SESSION_REQUIRED', 'Start a demo session first')
  if (opts.mutation) {
    assertSameOrigin(req)
    const header = req.headers.get(CSRF_HEADER) ?? ''
    const db = await getDb()
    const { rows } = await db.query<{ csrf_token_hash: string }>(
      'SELECT csrf_token_hash FROM sessions WHERE id = $1',
      [session.sessionId],
    )
    if (!header || !rows[0] || !safeEqualHex(sha256(header), rows[0].csrf_token_hash)) {
      throw new AppError(403, 'CSRF_INVALID', 'Missing or invalid CSRF token')
    }
  }
  return session
}
