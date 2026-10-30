import { isSandbox } from '@/lib/config'
import { sha256, stableStringify, uuid } from '@/lib/crypto'
import { json, type Queryable } from '@/lib/db/client'
import { remainingCharge } from '@/lib/money'
import { iso } from '@/lib/time'
import type { ReceiptView } from '@/lib/view-types'
import type { CaptureRow, OperationRow } from './truth'

/** Immutable receipt, written once per verified completion (UNIQUE(case_id, version)). */
export async function writeReceipt(
  tx: Queryable,
  args: { workspaceId: string; caseId: string; capture: CaptureRow; operation: OperationRow; policyVersion: string },
): Promise<void> {
  const { capture, operation } = args
  const { remainingCents } = remainingCharge(capture.amount_cents, [
    { refundId: operation.provider_refund_id!, cents: operation.amount_cents },
  ])
  const content: Omit<ReceiptView, 'contentHash'> = {
    version: 1,
    captureId: capture.provider_capture_id,
    refundId: operation.provider_refund_id!,
    captureCents: capture.amount_cents,
    refundCents: operation.amount_cents,
    remainingCents,
    policyVersion: args.policyVersion,
    planId: operation.plan_id,
    operationId: operation.id,
    observedAt: iso(operation.verified_at ?? new Date())!,
    generatedAt: new Date().toISOString(),
    // D.12: never describe a fixture result as live.
    verifiedAgainst: isSandbox() ? 'Verified against PayPal Sandbox' : 'Verified against fixture provider (not live Sandbox)',
  }
  await tx.query(
    `INSERT INTO evidence_receipts (id, workspace_id, case_id, version, content, content_hash)
     VALUES ($1, $2, $3, 1, $4::jsonb, $5)
     ON CONFLICT (case_id, version) DO NOTHING`,
    [uuid(), args.workspaceId, args.caseId, json(content), sha256(stableStringify(content))],
  )
}
