import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code)
  }
}

export const notFound = () => new AppError(404, 'NOT_FOUND', 'Not found')

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    )
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid request body', details: err.issues } },
      { status: 400 },
    )
  }
  console.error('[encore] unhandled error', err)
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Unexpected error' } }, { status: 500 })
}

/** Wrap a route handler so AppError/ZodError become typed JSON responses. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (err) {
      return errorResponse(err)
    }
  }
}

export function requestOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
