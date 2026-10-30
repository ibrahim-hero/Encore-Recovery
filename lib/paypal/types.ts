import { z } from 'zod'

// Provider objects use .passthrough(); fields we rely on are strictly typed.
const money = z.object({ currency_code: z.string(), value: z.string() }).passthrough()
const link = z.object({ href: z.string(), rel: z.string(), method: z.string().optional() }).passthrough()

export const orderSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    links: z.array(link).optional(),
    purchase_units: z
      .array(
        z
          .object({
            custom_id: z.string().optional(),
            amount: money.optional(),
            payments: z
              .object({
                captures: z
                  .array(z.object({ id: z.string(), status: z.string(), amount: money.optional() }).passthrough())
                  .optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

export const captureSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    amount: money,
    custom_id: z.string().optional(),
    payee: z.object({ merchant_id: z.string().optional() }).passthrough().optional(),
    supplementary_data: z
      .object({ related_ids: z.object({ order_id: z.string().optional() }).passthrough().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const refundSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    amount: money.optional(),
    invoice_id: z.string().optional(),
    links: z.array(link).optional(),
  })
  .passthrough()

export type PayPalOrder = z.infer<typeof orderSchema>
export type PayPalCapture = z.infer<typeof captureSchema>
export type PayPalRefund = z.infer<typeof refundSchema>

export type CreateOrderBody = {
  intent: 'CAPTURE'
  purchase_units: {
    reference_id: string
    custom_id: string
    description: string
    amount: { currency_code: 'USD'; value: string }
  }[]
  payment_source: {
    paypal: {
      experience_context: {
        return_url: string
        cancel_url: string
        user_action: 'PAY_NOW'
        shipping_preference: 'NO_SHIPPING'
        brand_name: string
      }
    }
  }
}

export type RefundBody = {
  amount: { currency_code: string; value: string }
  invoice_id: string
  note_to_payer: string
}

/** Network failure, timeout, or 5xx after a write: the outcome is NOT known (INV-04). */
export class ProviderUnknownOutcome extends Error {
  readonly kind = 'UNKNOWN_OUTCOME'
  constructor(message: string, public debugId?: string) {
    super(message)
  }
}

/** Business rejection (4xx other than 429). */
export class ProviderRejected extends Error {
  readonly kind = 'REJECTED'
  constructor(
    public status: number,
    public issue: string,
    public debugId?: string,
    public details?: unknown,
  ) {
    super(`PayPal rejected (${status}): ${issue}`)
  }
}

/** Safe to retry a read (429/5xx/network on GET). */
export class ProviderRetryable extends Error {
  readonly kind = 'RETRYABLE'
  constructor(message: string, public retryAfterMs?: number) {
    super(message)
  }
}

export interface PayPalProvider {
  readonly mode: 'fixture' | 'sandbox'
  createOrder(requestId: string, body: CreateOrderBody): Promise<PayPalOrder>
  getOrder(orderId: string): Promise<PayPalOrder>
  captureOrder(orderId: string, requestId: string): Promise<PayPalOrder>
  getCapture(captureId: string): Promise<PayPalCapture>
  refundCapture(captureId: string, requestId: string, body: RefundBody): Promise<PayPalRefund>
  getRefund(refundId: string): Promise<PayPalRefund>
  verifyWebhookSignature(headers: Headers, rawBody: string): Promise<boolean>
}

export function approveLink(order: PayPalOrder): string | undefined {
  return order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href
}
