import type { z } from 'zod'
import { getConfig } from '@/lib/config'
import {
  captureSchema,
  orderSchema,
  refundSchema,
  ProviderRejected,
  ProviderRetryable,
  ProviderUnknownOutcome,
  type PayPalProvider,
} from './types'

// Not configurable: this app must never talk to live PayPal (plan D.4).
const BASE_URL = 'https://api-m.sandbox.paypal.com'
const TIMEOUT_MS = 15_000

type TokenCache = { token: string; expiresAt: number }
let tokenCache: TokenCache | undefined

async function getAccessToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token
  const c = getConfig()
  const basic = Buffer.from(`${c.PAYPAL_CLIENT_ID}:${c.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new ProviderRetryable(`OAuth failed with ${res.status}`)
  const body = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 }
  return body.access_token
}

async function call<S extends z.ZodTypeAny>(
  method: 'GET' | 'POST',
  path: string,
  schema: S,
  opts: { requestId?: string; body?: unknown } = {},
  retried = false,
): Promise<z.infer<S>> {
  const isWrite = method === 'POST'
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(opts.requestId ? { 'PayPal-Request-Id': opts.requestId } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    const msg = `Network error on ${method} ${path}: ${(err as Error).message}`
    throw isWrite ? new ProviderUnknownOutcome(msg) : new ProviderRetryable(msg)
  }

  const debugId = res.headers.get('paypal-debug-id') ?? undefined
  if (res.status === 401 && !retried) {
    await getAccessToken(true)
    return call(method, path, schema, opts, true)
  }
  if (res.status === 429 || res.status >= 500) {
    const retryAfter = Number(res.headers.get('retry-after')) * 1000 || undefined
    const msg = `PayPal ${res.status} on ${method} ${path}`
    throw isWrite ? new ProviderUnknownOutcome(msg, debugId) : new ProviderRetryable(msg, retryAfter)
  }
  const text = await res.text()
  const parsed = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const issue = parsed?.details?.[0]?.issue ?? parsed?.name ?? 'UNKNOWN_ERROR'
    throw new ProviderRejected(res.status, issue, debugId ?? parsed?.debug_id, parsed?.details)
  }
  return schema.parse(parsed)
}

export const sandboxProvider: PayPalProvider = {
  mode: 'sandbox',
  createOrder: (requestId, body) => call('POST', '/v2/checkout/orders', orderSchema, { requestId, body }),
  getOrder: (id) => call('GET', `/v2/checkout/orders/${encodeURIComponent(id)}`, orderSchema),
  captureOrder: (id, requestId) =>
    call('POST', `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, orderSchema, { requestId, body: {} }),
  getCapture: (id) => call('GET', `/v2/payments/captures/${encodeURIComponent(id)}`, captureSchema),
  refundCapture: (captureId, requestId, body) =>
    call('POST', `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, refundSchema, { requestId, body }),
  getRefund: (id) => call('GET', `/v2/payments/refunds/${encodeURIComponent(id)}`, refundSchema),

  async verifyWebhookSignature(headers, rawBody) {
    const c = getConfig()
    if (!c.PAYPAL_WEBHOOK_ID) return false
    const res = await fetch(`${BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: headers.get('paypal-auth-algo'),
        cert_url: headers.get('paypal-cert-url'),
        transmission_id: headers.get('paypal-transmission-id'),
        transmission_sig: headers.get('paypal-transmission-sig'),
        transmission_time: headers.get('paypal-transmission-time'),
        webhook_id: c.PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(rawBody),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return false
    const body = (await res.json()) as { verification_status?: string }
    return body.verification_status === 'SUCCESS'
  },
}
