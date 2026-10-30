'use client'

import useSWR, { type SWRConfiguration } from 'swr'

// CSRF token lives in memory only; re-fetched from GET /api/demo/session on reload (C.8).
let csrfToken: string | null = null
let pending: Promise<string> | null = null

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export function ensureSession(): Promise<string> {
  if (csrfToken) return Promise.resolve(csrfToken)
  pending ??= (async () => {
    let res = await fetch('/api/demo/session', { credentials: 'include', cache: 'no-store' })
    if (res.status === 401) res = await fetch('/api/demo/session', { method: 'POST', credentials: 'include' })
    if (!res.ok) throw new ApiError(res.status, 'SESSION_FAILED', 'Could not start a demo session')
    const body = (await res.json()) as { csrfToken: string }
    csrfToken = body.csrfToken
    return csrfToken
  })().finally(() => {
    pending = null
  })
  return pending
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } }).error
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Request failed (${res.status})`)
  }
  return body as T
}

async function withSessionRetry<T>(run: () => Promise<Response>): Promise<T> {
  await ensureSession()
  let res = await run()
  if (res.status === 401) {
    csrfToken = null
    await ensureSession()
    res = await run()
  }
  return parse<T>(res)
}

export function apiGet<T>(url: string): Promise<T> {
  return withSessionRetry<T>(() => fetch(url, { credentials: 'include', cache: 'no-store' }))
}

export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return withSessionRetry<T>(() =>
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-encore-csrf': csrfToken ?? '' },
      body: JSON.stringify(body ?? {}),
    }),
  )
}

export function useApi<T>(url: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(url, apiGet, { keepPreviousData: true, ...config })
}
