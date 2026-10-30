import { uuid } from '@/lib/crypto'
import { getDb } from '@/lib/db/client'
import { getProvider } from '@/lib/paypal'
import { audit, bumpJob } from './audit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REFUND_EVENTS = new Set(['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.REFUND.PENDING', 'PAYMENT.REFUND.FAILED'])
const CAPTURE_EVENTS = new Set(['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.REVERSED'])

type Resource = {
  id?: string
  invoice_id?: string
  custom_id?: string
  status?: string
  links?: { rel: string; href: string }[]
  supplementary_data?: { related_ids?: { order_id?: string } }
}

export type WebhookResult = { status: 200 | 400; result: string }

/** Webhooks accelerate reconciliation; they never complete anything directly (C.4). */
export async function handlePayPalWebhook(headers: Headers, rawBody: string): Promise<WebhookResult> {
  let event: { id?: string; event_type?: string; resource?: Resource }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return { status: 400, result: 'INVALID_JSON' }
  }
  if (!event.id || !event.event_type) return { status: 400, result: 'MISSING_FIELDS' }

  const verified = await getProvider().verifyWebhookSignature(headers, rawBody).catch(() => false)
  const db = await getDb()
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO webhook_events (id, provider_event_id, event_type, resource_id, raw_body, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (provider_event_id) DO NOTHING RETURNING id`,
    [uuid(), event.id, event.event_type, event.resource?.id ?? null, rawBody, verified ? 'VERIFIED' : 'FAILED'],
  )
  if (!rows[0]) return { status: 200, result: 'DUPLICATE' }
  const rowId = rows[0].id
  const finish = (result: string, workspaceId: string | null = null, ref: string | null = null) =>
    db.query(
      'UPDATE webhook_events SET processing_result = $2, workspace_id = $3, correlated_ref = $4, processed_at = now() WHERE id = $1',
      [rowId, result, workspaceId, ref],
    )

  if (!verified) {
    await finish('REJECTED_SIGNATURE')
    return { status: 400, result: 'REJECTED_SIGNATURE' }
  }

  const r = event.resource ?? {}
  if (REFUND_EVENTS.has(event.event_type)) {
    let opRow: { id: string; workspace_id: string; case_id: string; booking_id: string } | undefined
    const invoiceOpId = r.invoice_id?.startsWith('ER-') ? r.invoice_id.slice(3) : undefined
    if (invoiceOpId && UUID_RE.test(invoiceOpId)) {
      opRow = (await db.query<typeof opRow & object>(
        'SELECT o.id, o.workspace_id, o.case_id, c.booking_id FROM money_operations o JOIN captures c ON c.id = o.capture_id WHERE o.id = $1',
        [invoiceOpId],
      )).rows[0]
    }
    if (!opRow) {
      const up = r.links?.find((l) => l.rel === 'up')?.href
      const captureId = up?.split('/').pop()
      if (captureId) {
        opRow = (await db.query<typeof opRow & object>(
          'SELECT o.id, o.workspace_id, o.case_id, c.booking_id FROM money_operations o JOIN captures c ON c.id = o.capture_id WHERE c.provider_capture_id = $1',
          [captureId],
        )).rows[0]
      }
    }
    if (!opRow) {
      await finish('UNMAPPED')
      return { status: 200, result: 'UNMAPPED' }
    }
    await finish('MAPPED', opRow.workspace_id, `operation:${opRow.id}`)
    await audit(db, {
      workspaceId: opRow.workspace_id,
      bookingId: opRow.booking_id,
      caseId: opRow.case_id,
      type: 'WEBHOOK_RECEIVED',
      source: 'PAYPAL',
      summary: `Verified webhook ${event.event_type} for refund ${r.id ?? 'unknown'}; reconciling by direct read.`,
    })
    await bumpJob(db, `refund:${opRow.id}`)
    return { status: 200, result: 'MAPPED' }
  }

  if (CAPTURE_EVENTS.has(event.event_type) || event.event_type === 'CHECKOUT.ORDER.APPROVED') {
    const isOrder = event.event_type === 'CHECKOUT.ORDER.APPROVED'
    const { rows: m } = await db.query<{ workspace_id: string; booking_id: string }>(
      isOrder
        ? 'SELECT workspace_id, booking_id FROM payment_orders WHERE provider_order_id = $1'
        : 'SELECT workspace_id, booking_id FROM captures WHERE provider_capture_id = $1',
      [r.id ?? ''],
    )
    if (!m[0]) {
      await finish('UNMAPPED')
      return { status: 200, result: 'UNMAPPED' }
    }
    await finish('EVIDENCE_ONLY', m[0].workspace_id, `booking:${m[0].booking_id}`)
    await audit(db, {
      workspaceId: m[0].workspace_id,
      bookingId: m[0].booking_id,
      type: 'WEBHOOK_RECEIVED',
      source: 'PAYPAL',
      summary: `Verified webhook ${event.event_type} recorded as evidence.`,
    })
    return { status: 200, result: 'EVIDENCE_ONLY' }
  }

  await finish('IGNORED_EVENT_TYPE')
  return { status: 200, result: 'IGNORED_EVENT_TYPE' }
}
