import { isSandbox } from '@/lib/config'
import { getDb } from '@/lib/db/client'
import { fakeProvider } from './fake'
import { sandboxProvider } from './sandbox'
import { ProviderUnknownOutcome, type PayPalProvider, type PayPalRefund, type RefundBody } from './types'

export * from './types'

export function getProvider(): PayPalProvider {
  return isSandbox() ? sandboxProvider : fakeProvider
}

/**
 * Refund with the Fault Lab hook (D.11): if DROP_REFUND_RESPONSE is armed for
 * this case, the provider call completes for real and then its response is
 * discarded, producing a genuine UNKNOWN outcome for the worker to reconcile.
 */
export async function refundWithFaults(
  caseId: string,
  captureId: string,
  requestId: string,
  body: RefundBody,
): Promise<PayPalRefund> {
  const refund = await getProvider().refundCapture(captureId, requestId, body)
  const db = await getDb()
  const { rows } = await db.query<{ id: string }>(
    `UPDATE armed_faults SET triggered_at = now()
     WHERE case_id = $1 AND fault = 'DROP_REFUND_RESPONSE' AND triggered_at IS NULL
     RETURNING id`,
    [caseId],
  )
  if (rows[0]) {
    throw new ProviderUnknownOutcome('Fault Lab: refund response dropped after provider accepted the request')
  }
  return refund
}
