import { FIXTURE_MERCHANT_ID, getConfig } from '@/lib/config'
import { randomToken, sha256, stableStringify } from '@/lib/crypto'
import { getDb, json } from '@/lib/db/client'
import { amountMatches, decimalToCents } from '@/lib/money'
import {
  ProviderRejected,
  type CreateOrderBody,
  type PayPalCapture,
  type PayPalOrder,
  type PayPalProvider,
  type PayPalRefund,
  type RefundBody,
} from './types'

// Realistic fake (PDF section 29): request-key idempotency map, delayed refund
// completion, and the same object shapes as Sandbox. Persisted in the DB so it
// survives restarts exactly like a remote provider would.

type StoredOrder = {
  id: string
  status: 'CREATED' | 'APPROVED' | 'COMPLETED'
  custom_id: string
  amount: { currency_code: string; value: string }
  return_url: string
  cancel_url: string
  capture_id?: string
}
type StoredRefund = PayPalRefund & { capture_id: string; created_ms: number }

const providerId = (prefix: string) => `${prefix}${randomToken(9).replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`.slice(0, 17)

async function load<T>(id: string): Promise<T | undefined> {
  const db = await getDb()
  const { rows } = await db.query<{ data: T }>('SELECT data FROM fixture_provider_objects WHERE id = $1', [id])
  return rows[0]?.data
}

async function save(id: string, kind: string, data: unknown): Promise<void> {
  const db = await getDb()
  await db.query(
    `INSERT INTO fixture_provider_objects (id, kind, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [id, kind, json(data)],
  )
}

/** Idempotency: same request ID + same body returns the stored result; a different body is rejected. */
async function withRequestKey<T>(scope: string, requestId: string, body: unknown, create: () => Promise<T>): Promise<T> {
  const key = `req:${scope}:${requestId}`
  const bodyHash = sha256(stableStringify(body))
  const existing = await load<{ bodyHash: string; resultId: string }>(key)
  if (existing) {
    if (existing.bodyHash !== bodyHash) throw new ProviderRejected(422, 'DUPLICATE_INVOICE_ID_OR_MISMATCHED_REQUEST')
    return (await load<T>(existing.resultId)) as T
  }
  const result = await create()
  await save(key, 'request', { bodyHash, resultId: (result as { id: string }).id })
  return result
}

function orderView(o: StoredOrder): PayPalOrder {
  return {
    id: o.id,
    status: o.status,
    links: [{ rel: 'payer-action', href: fakeApproveUrl(o), method: 'GET' }],
    purchase_units: [
      {
        custom_id: o.custom_id,
        amount: o.amount,
        payments: o.capture_id ? { captures: [{ id: o.capture_id, status: 'COMPLETED', amount: o.amount }] } : undefined,
      },
    ],
  }
}

function fakeApproveUrl(o: StoredOrder): string {
  const origin = new URL(o.return_url).origin
  return `${origin}/demo/fake-paypal?token=${o.id}`
}

export const fakeProvider: PayPalProvider & {
  approveOrder(orderId: string): Promise<{ returnUrl: string }>
  cancelUrlFor(orderId: string): Promise<string>
} = {
  mode: 'fixture',

  async createOrder(requestId, body: CreateOrderBody) {
    return withRequestKey('order', requestId, body, async () => {
      const unit = body.purchase_units[0]
      const ctx = body.payment_source.paypal.experience_context
      const order: StoredOrder = {
        id: providerId('5O'),
        status: 'CREATED',
        custom_id: unit.custom_id,
        amount: unit.amount,
        return_url: ctx.return_url,
        cancel_url: ctx.cancel_url,
      }
      await save(order.id, 'order', order)
      return order
    }).then((o) => orderView(o as StoredOrder))
  },

  async getOrder(orderId) {
    const o = await load<StoredOrder>(orderId)
    if (!o) throw new ProviderRejected(404, 'RESOURCE_NOT_FOUND')
    return orderView(o)
  },

  async approveOrder(orderId) {
    const o = await load<StoredOrder>(orderId)
    if (!o) throw new ProviderRejected(404, 'RESOURCE_NOT_FOUND')
    if (o.status === 'CREATED') await save(o.id, 'order', { ...o, status: 'APPROVED' })
    const url = new URL(o.return_url)
    url.searchParams.set('token', o.id)
    url.searchParams.set('PayerID', 'FIXTUREPAYER01')
    return { returnUrl: url.toString() }
  },

  async cancelUrlFor(orderId) {
    const o = await load<StoredOrder>(orderId)
    if (!o) throw new ProviderRejected(404, 'RESOURCE_NOT_FOUND')
    const url = new URL(o.cancel_url)
    url.searchParams.set('token', o.id)
    return url.toString()
  },

  async captureOrder(orderId, requestId) {
    const result = await withRequestKey('capture', requestId, { orderId }, async () => {
      const o = await load<StoredOrder>(orderId)
      if (!o) throw new ProviderRejected(404, 'RESOURCE_NOT_FOUND')
      if (o.status === 'COMPLETED') throw new ProviderRejected(422, 'ORDER_ALREADY_CAPTURED')
      if (o.status !== 'APPROVED') throw new ProviderRejected(422, 'ORDER_NOT_APPROVED')
      const capture: PayPalCapture = {
        id: providerId('3C'),
        status: 'COMPLETED',
        amount: o.amount,
        custom_id: o.custom_id,
        payee: { merchant_id: FIXTURE_MERCHANT_ID },
        supplementary_data: { related_ids: { order_id: o.id } },
      }
      await save(capture.id, 'capture', capture)
      const completed = { ...o, status: 'COMPLETED' as const, capture_id: capture.id }
      await save(o.id, 'order', completed)
      return completed
    })
    return orderView(result as StoredOrder)
  },

  async getCapture(captureId) {
    const c = await load<PayPalCapture>(captureId)
    if (!c) throw new ProviderRejected(404, 'RESOURCE_NOT_FOUND')
    return c
  },

  async refundCapture(captureId, requestId, body: RefundBody) {
    const refund = await withRequestKey('refund', requestId, { captureId, body }, async () => {
      const capture = await load<PayPalCapture>(captureId)
      if (!capture) throw new ProviderRejected(404, 'RESOURCE_NOT_FOUND')
      if (capture.status !== 'COMPLETED') throw new ProviderRejected(422, 'CAPTURE_FULLY_REFUNDED')
      if (decimalToCents(body.amount.value) > decimalToCents(capture.amount.value)) {
        throw new ProviderRejected(422, 'REFUND_AMOUNT_EXCEEDED')
      }
      const r: StoredRefund = {
        id: providerId('1R'),
        status: 'PENDING',
        amount: body.amount,
        invoice_id: body.invoice_id,
        links: [{ rel: 'up', href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}`, method: 'GET' }],
        capture_id: captureId,
        created_ms: Date.now(),
      }
      await save(r.id, 'refund', r)
      return r
    })
    return publicRefund(refund as StoredRefund)
  },

  async getRefund(refundId) {
    const r = await load<StoredRefund>(refundId)
    if (!r) throw new ProviderRejected(404, 'RESOURCE_NOT_FOUND')
    // Delayed completion: PENDING until the configured interval passes.
    if (r.status === 'PENDING' && Date.now() - r.created_ms >= getConfig().FIXTURE_REFUND_COMPLETE_MS) {
      const done = { ...r, status: 'COMPLETED' }
      await save(r.id, 'refund', done)
      const capture = await load<PayPalCapture>(r.capture_id)
      if (capture && amountMatches(r.amount?.value, decimalToCents(capture.amount.value))) {
        await save(capture.id, 'capture', { ...capture, status: 'REFUNDED' })
      }
      return publicRefund(done)
    }
    return publicRefund(r)
  },

  async verifyWebhookSignature(headers, rawBody) {
    // Fixture events are signed with a deterministic digest; there is no bypass flag.
    return headers.get('paypal-transmission-sig') === sha256(`fixture:${rawBody}`)
  },
}

function publicRefund(r: StoredRefund): PayPalRefund {
  const { capture_id: _c, created_ms: _t, ...rest } = r
  return rest
}
