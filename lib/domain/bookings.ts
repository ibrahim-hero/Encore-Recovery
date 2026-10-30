import { expectedMerchantId, isSandbox } from '@/lib/config'
import { randomToken, safeEqualHex, sha256, uuid } from '@/lib/crypto'
import { getDb, json, type Queryable } from '@/lib/db/client'
import { AppError, notFound } from '@/lib/http'
import { amountMatches, centsToDecimal } from '@/lib/money'
import {
  approveLink,
  getProvider,
  ProviderRejected,
  ProviderRetryable,
  ProviderUnknownOutcome,
  type CreateOrderBody,
  type PayPalOrder,
} from '@/lib/paypal'
import { audit } from './audit'
import type { BookingRow } from './truth'

type OrderRow = {
  id: string
  workspace_id: string
  booking_id: string
  create_request_id: string
  capture_request_id: string
  create_state: string
  provider_order_id: string | null
  approve_url: string | null
  return_nonce_hash: string
  create_payload: CreateOrderBody
  amount_cents: number
  currency: string
}

async function lockOwnedBooking(q: Queryable, workspaceId: string, bookingId: string): Promise<BookingRow> {
  const { rows } = await q.query<BookingRow>(
    'SELECT * FROM bookings WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
    [bookingId, workspaceId],
  )
  if (!rows[0]) throw notFound()
  return rows[0]
}

export async function createSampleBooking(workspaceId: string, templateSlug: string): Promise<{ bookingId: string }> {
  const db = await getDb()
  return db.tx(async (tx) => {
    const { rows } = await tx.query<{ slug: string; title: string; amount_cents: number; currency: string }>(
      'SELECT * FROM booking_templates WHERE slug = $1',
      [templateSlug],
    )
    const t = rows[0]
    if (!t) throw new AppError(400, 'UNKNOWN_TEMPLATE')
    const bookingId = uuid()
    await tx.query(
      `INSERT INTO bookings (id, workspace_id, code, template_slug, title, amount_cents, currency, policy_id)
       VALUES ($1, $2, 'EN-' || nextval('booking_code_seq'), $3, $4, $5, $6, 'merchant-unfulfillable:v1')`,
      [bookingId, workspaceId, t.slug, t.title, t.amount_cents, t.currency],
    )
    await audit(tx, {
      workspaceId,
      bookingId,
      type: 'BOOKING_CREATED',
      source: 'SYSTEM',
      summary: `Demonstration booking created: ${t.title}.`,
    })
    return { bookingId }
  })
}

function isAllowedApproveUrl(url: string, origin: string): boolean {
  try {
    const u = new URL(url)
    if (isSandbox()) return u.protocol === 'https:' && u.hostname.endsWith('.sandbox.paypal.com')
    return u.origin === origin
  } catch {
    return false
  }
}

export async function startCheckout(
  workspaceId: string,
  bookingId: string,
  origin: string,
): Promise<{ approveUrl: string }> {
  const db = await getDb()

  const order = await db.tx(async (tx) => {
    const booking = await lockOwnedBooking(tx, workspaceId, bookingId)
    if (!['NOT_STARTED', 'AWAITING_BUYER'].includes(booking.payment_state)) {
      throw new AppError(409, 'PAYMENT_ALREADY_STARTED', `Payment is ${booking.payment_state}`)
    }
    const { rows: live } = await tx.query<OrderRow>(
      `SELECT * FROM payment_orders WHERE booking_id = $1 AND create_state NOT IN ('CANCELLED','FAILED','EXPIRED')`,
      [bookingId],
    )
    if (live[0]) return live[0]

    const nonce = randomToken(16)
    const body: CreateOrderBody = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: booking.id,
          custom_id: booking.id,
          description: `${booking.code} ${booking.title}`.slice(0, 127),
          amount: { currency_code: 'USD', value: centsToDecimal(booking.amount_cents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: `${origin}/demo/return?b=${booking.id}&n=${nonce}`,
            cancel_url: `${origin}/demo/return?b=${booking.id}&n=${nonce}&cancel=1`,
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            brand_name: 'Encore Recovery Demo',
          },
        },
      },
    }
    const row: OrderRow = {
      id: uuid(),
      workspace_id: workspaceId,
      booking_id: bookingId,
      create_request_id: uuid(),
      capture_request_id: uuid(),
      create_state: 'CREATING',
      provider_order_id: null,
      approve_url: null,
      return_nonce_hash: sha256(nonce),
      create_payload: body,
      amount_cents: booking.amount_cents,
      currency: booking.currency,
    }
    await tx.query(
      `INSERT INTO payment_orders (id, workspace_id, booking_id, create_request_id, capture_request_id, create_state,
         return_nonce_hash, create_payload, amount_cents, currency)
       VALUES ($1,$2,$3,$4,$5,'CREATING',$6,$7::jsonb,$8,$9)`,
      [row.id, workspaceId, bookingId, row.create_request_id, row.capture_request_id, row.return_nonce_hash, json(body), row.amount_cents, row.currency],
    )
    await tx.query(
      "UPDATE bookings SET payment_state = 'AWAITING_BUYER', updated_at = now() WHERE id = $1",
      [bookingId],
    )
    return row
  })

  if (order.create_state === 'CREATED' && order.approve_url) return { approveUrl: order.approve_url }

  // Persist-before-send is done; the create call reuses the stored request ID and body.
  let created: PayPalOrder
  try {
    created = await getProvider().createOrder(order.create_request_id, order.create_payload)
  } catch (err) {
    if (err instanceof ProviderRejected) {
      await db.tx(async (tx) => {
        await tx.query(
          "UPDATE payment_orders SET create_state = 'FAILED', last_error = $2::jsonb, updated_at = now() WHERE id = $1",
          [order.id, json({ issue: err.issue, debugId: err.debugId })],
        )
        await tx.query("UPDATE bookings SET payment_state = 'NOT_STARTED', updated_at = now() WHERE id = $1", [bookingId])
      })
      throw new AppError(502, 'ORDER_REJECTED', err.message)
    }
    await db.query("UPDATE payment_orders SET create_state = 'UNKNOWN', updated_at = now() WHERE id = $1", [order.id])
    throw new AppError(503, 'ORDER_OUTCOME_UNKNOWN', 'PayPal did not confirm the order. Retry uses the same request ID.')
  }

  const approveUrl = approveLink(created)
  if (!approveUrl || !isAllowedApproveUrl(approveUrl, origin)) {
    await db.query(
      "UPDATE payment_orders SET create_state = 'REVIEW_REQUIRED', provider_order_id = $2, updated_at = now() WHERE id = $1",
      [order.id, created.id],
    )
    throw new AppError(502, 'APPROVE_LINK_INVALID', 'Provider returned an unexpected approval link')
  }

  await db.tx(async (tx) => {
    await tx.query(
      `UPDATE payment_orders SET create_state = 'CREATED', provider_order_id = $2, provider_status = $3,
         approve_url = $4, updated_at = now() WHERE id = $1`,
      [order.id, created.id, created.status, approveUrl],
    )
    await audit(tx, {
      workspaceId,
      bookingId,
      type: 'ORDER_CREATED',
      source: 'PAYPAL',
      summary: `PayPal order ${created.id} created; awaiting buyer approval.`,
      data: { orderId: created.id },
    })
  })
  return { approveUrl }
}

async function lockOrderForReturn(
  q: Queryable,
  workspaceId: string,
  bookingId: string,
  orderToken: string,
  returnNonce: string,
): Promise<OrderRow> {
  const { rows } = await q.query<OrderRow>(
    `SELECT * FROM payment_orders
     WHERE booking_id = $1 AND workspace_id = $2 AND provider_order_id = $3 FOR UPDATE`,
    [bookingId, workspaceId, orderToken],
  )
  const order = rows[0]
  if (!order) throw notFound()
  if (!safeEqualHex(sha256(returnNonce), order.return_nonce_hash)) {
    throw new AppError(403, 'RETURN_NONCE_INVALID', 'Return link does not match this order')
  }
  return order
}

export type CaptureOutcome = { state: 'COMPLETED' | 'PENDING' | 'UNKNOWN' | 'FAILED' | 'REVIEW_REQUIRED' }

export async function completeCapture(
  workspaceId: string,
  bookingId: string,
  input: { orderToken: string; returnNonce: string },
): Promise<CaptureOutcome> {
  const db = await getDb()
  const provider = getProvider()

  const order = await db.tx(async (tx) => {
    const o = await lockOrderForReturn(tx, workspaceId, bookingId, input.orderToken, input.returnNonce)
    if (o.create_state === 'CAPTURED') return o
    if (!['CREATED', 'CAPTURING', 'UNKNOWN'].includes(o.create_state)) {
      throw new AppError(409, 'ORDER_NOT_CAPTURABLE', `Order is ${o.create_state}`)
    }
    await tx.query("UPDATE payment_orders SET create_state = 'CAPTURING', updated_at = now() WHERE id = $1", [o.id])
    await tx.query("UPDATE bookings SET payment_state = 'CAPTURING', updated_at = now() WHERE id = $1", [bookingId])
    return o
  })
  if (order.create_state === 'CAPTURED') {
    const { rows } = await db.query<{ payment_state: string }>('SELECT payment_state FROM bookings WHERE id = $1', [bookingId])
    return { state: (rows[0]?.payment_state as CaptureOutcome['state']) ?? 'COMPLETED' }
  }
  const orderId = order.provider_order_id!

  let captureId: string | undefined
  try {
    const current = await provider.getOrder(orderId)
    if (current.status === 'COMPLETED') {
      captureId = current.purchase_units?.[0]?.payments?.captures?.[0]?.id
    } else if (current.status !== 'APPROVED') {
      await db.tx(async (tx) => {
        await tx.query("UPDATE payment_orders SET create_state = 'CREATED', updated_at = now() WHERE id = $1", [order.id])
        await tx.query("UPDATE bookings SET payment_state = 'AWAITING_BUYER', updated_at = now() WHERE id = $1", [bookingId])
      })
      throw new AppError(409, 'ORDER_NOT_APPROVED', `PayPal order status is ${current.status}`)
    } else {
      const captured = await provider.captureOrder(orderId, order.capture_request_id)
      captureId = captured.purchase_units?.[0]?.payments?.captures?.[0]?.id
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof ProviderRejected && err.issue === 'ORDER_ALREADY_CAPTURED') {
      const again = await provider.getOrder(orderId)
      captureId = again.purchase_units?.[0]?.payments?.captures?.[0]?.id
    } else if (err instanceof ProviderRejected) {
      await db.tx(async (tx) => {
        await tx.query(
          "UPDATE payment_orders SET create_state = 'FAILED', last_error = $2::jsonb, updated_at = now() WHERE id = $1",
          [order.id, json({ issue: err.issue, debugId: err.debugId })],
        )
        await tx.query("UPDATE bookings SET payment_state = 'FAILED', updated_at = now() WHERE id = $1", [bookingId])
        await audit(tx, { workspaceId, bookingId, type: 'CAPTURE_REJECTED', source: 'PAYPAL', summary: `PayPal rejected the capture: ${err.issue}.` })
      })
      return { state: 'FAILED' }
    } else if (err instanceof ProviderUnknownOutcome || err instanceof ProviderRetryable) {
      await db.tx(async (tx) => {
        await tx.query("UPDATE payment_orders SET create_state = 'UNKNOWN', updated_at = now() WHERE id = $1", [order.id])
        await tx.query("UPDATE bookings SET payment_state = 'UNKNOWN', updated_at = now() WHERE id = $1", [bookingId])
        await audit(tx, { workspaceId, bookingId, type: 'CAPTURE_UNKNOWN', source: 'SYSTEM', summary: 'Capture outcome unknown; retrying confirms with the same request ID.' })
      })
      return { state: 'UNKNOWN' }
    } else {
      throw err
    }
  }

  if (!captureId) {
    await db.query("UPDATE bookings SET payment_state = 'REVIEW_REQUIRED', updated_at = now() WHERE id = $1", [bookingId])
    return { state: 'REVIEW_REQUIRED' }
  }

  // Independent verification by direct GET (INV-03).
  const capture = await provider.getCapture(captureId)
  const verified =
    capture.status === 'COMPLETED' &&
    amountMatches(capture.amount.value, order.amount_cents) &&
    capture.amount.currency_code === order.currency &&
    capture.payee?.merchant_id === expectedMerchantId() &&
    capture.supplementary_data?.related_ids?.order_id === orderId
  const paymentState = verified
    ? 'COMPLETED'
    : capture.status === 'PENDING'
      ? 'PENDING'
      : capture.status === 'DECLINED' || capture.status === 'FAILED'
        ? 'FAILED'
        : 'REVIEW_REQUIRED'

  await db.tx(async (tx) => {
    await tx.query(
      `INSERT INTO captures (id, workspace_id, booking_id, payment_order_id, provider_capture_id, provider_order_id,
         amount_cents, currency, provider_status, payee_merchant_id, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $11::boolean THEN now() ELSE NULL END)
       ON CONFLICT (payment_order_id) DO UPDATE SET provider_status = EXCLUDED.provider_status, observed_at = now(), updated_at = now()`,
      [uuid(), workspaceId, bookingId, order.id, capture.id, orderId, order.amount_cents, capture.amount.currency_code, capture.status, capture.payee?.merchant_id ?? null, verified],
    )
    await tx.query(
      "UPDATE payment_orders SET create_state = 'CAPTURED', provider_status = 'COMPLETED', updated_at = now() WHERE id = $1",
      [order.id],
    )
    await tx.query(
      'UPDATE bookings SET payment_state = $2, revision = revision + 1, updated_at = now() WHERE id = $1',
      [bookingId, paymentState],
    )
    await audit(tx, {
      workspaceId,
      bookingId,
      type: verified ? 'PAYMENT_CAPTURED' : 'CAPTURE_NEEDS_REVIEW',
      source: 'PAYPAL',
      summary: verified
        ? `Capture ${capture.id} verified COMPLETED by direct read.`
        : `Capture ${capture.id} returned ${capture.status}; facts did not fully match.`,
      data: { captureId: capture.id, orderId },
    })
  })
  return { state: paymentState as CaptureOutcome['state'] }
}

export async function cancelPayment(
  workspaceId: string,
  bookingId: string,
  input: { orderToken: string; returnNonce: string },
): Promise<void> {
  const db = await getDb()
  await db.tx(async (tx) => {
    const order = await lockOrderForReturn(tx, workspaceId, bookingId, input.orderToken, input.returnNonce)
    if (order.create_state !== 'CREATED') return
    await tx.query("UPDATE payment_orders SET create_state = 'CANCELLED', updated_at = now() WHERE id = $1", [order.id])
    await tx.query("UPDATE bookings SET payment_state = 'NOT_STARTED', updated_at = now() WHERE id = $1", [bookingId])
    await audit(tx, {
      workspaceId,
      bookingId,
      type: 'BUYER_CANCELLED',
      source: 'PAYPAL',
      summary: 'Buyer cancelled on PayPal. No amount was captured; a new order can be started.',
    })
  })
}

/** Labeled simulation of a merchant-confirmed failure (INV-08: only the merchant path sets this). */
export async function simulateMerchantFailure(
  workspaceId: string,
  bookingId: string,
  reason: string,
): Promise<{ caseId: string }> {
  const db = await getDb()
  return db.tx(async (tx) => {
    const booking = await lockOwnedBooking(tx, workspaceId, bookingId)
    if (booking.fulfillment_state === 'SCHEDULED') {
      await tx.query(
        `UPDATE bookings SET fulfillment_state = 'UNFULFILLABLE', fulfillment_reason = $2, fulfillment_simulated = true,
           fulfillment_confirmed_at = now(), revision = revision + 1, updated_at = now() WHERE id = $1`,
        [bookingId, reason],
      )
    }
    await tx.query(
      `INSERT INTO recovery_cases (id, workspace_id, booking_id, state) VALUES ($1, $2, $3, 'OPEN')
       ON CONFLICT (booking_id) DO NOTHING`,
      [uuid(), workspaceId, bookingId],
    )
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM recovery_cases WHERE booking_id = $1', [bookingId])
    const caseId = rows[0].id
    if (booking.fulfillment_state === 'SCHEDULED') {
      await audit(tx, {
        workspaceId,
        bookingId,
        caseId,
        type: 'MERCHANT_CONFIRMED_UNFULFILLABLE',
        source: 'MERCHANT',
        summary: `Merchant confirmed the booking cannot be fulfilled (simulated): ${reason}`,
      })
      await tx.query('UPDATE audit_events SET case_id = $1 WHERE booking_id = $2 AND case_id IS NULL', [caseId, bookingId])
    }
    return { caseId }
  })
}
