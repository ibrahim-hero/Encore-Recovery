import { sha256, stableStringify, uuid } from '@/lib/crypto'
import { getDb, json } from '@/lib/db/client'
import { AppError, notFound } from '@/lib/http'
import { centsToDecimal } from '@/lib/money'
import { audit, bumpJob, enqueueJob } from './audit'
import { planFingerprint } from './eligibility'
import { loadCaseContext } from './snapshot'

type PlanRow = {
  id: string
  case_id: string
  state: string
  capture_id: string
  amount_cents: number
  currency: string
  booking_revision: number
  policy_id: string
  fingerprint: string
  expires_at: Date
}

/** Accept a plan (PDF section 14 "Accepting an execution request"; addendum D.7). Returns 202 semantics. */
export async function executePlan(
  workspaceId: string,
  planId: string,
): Promise<{ operationId: string; existing: boolean }> {
  const db = await getDb()
  return db.tx(async (tx) => {
    const { rows: plans } = await tx.query<PlanRow>(
      'SELECT * FROM recovery_plans WHERE id = $1 AND workspace_id = $2',
      [planId, workspaceId],
    )
    const plan = plans[0]
    if (!plan) throw notFound()

    const { rows: cases } = await tx.query<{ id: string; booking_id: string }>(
      'SELECT id, booking_id FROM recovery_cases WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
      [plan.case_id, workspaceId],
    )
    if (!cases[0]) throw notFound()

    // Idempotent: one FULL_REFUND per capture, ever (INV-05).
    const { rows: existing } = await tx.query<{ id: string }>(
      "SELECT id FROM money_operations WHERE capture_id = $1 AND kind = 'FULL_REFUND'",
      [plan.capture_id],
    )
    if (existing[0]) return { operationId: existing[0].id, existing: true }

    if (plan.state !== 'READY') throw new AppError(409, 'PLAN_NOT_READY', `Plan is ${plan.state}`)
    if (new Date(plan.expires_at) <= new Date()) {
      await tx.query("UPDATE recovery_plans SET state = 'EXPIRED' WHERE id = $1", [plan.id])
      throw new AppError(409, 'PLAN_EXPIRED', 'Plan expired. Run a fresh analysis.')
    }

    const ctx = await loadCaseContext(tx, plan.case_id, workspaceId)
    if (!ctx || !ctx.facts.capture) throw notFound()
    const stale =
      ctx.facts.capture.id !== plan.capture_id ||
      ctx.facts.booking.revision !== plan.booking_revision ||
      ctx.policy.id !== plan.policy_id ||
      planFingerprint(ctx.eligibilityInput) !== plan.fingerprint
    if (stale) {
      await tx.query("UPDATE recovery_plans SET state = 'STALE' WHERE id = $1", [plan.id])
      await tx.query("UPDATE recovery_cases SET state = 'OPEN', updated_at = now() WHERE id = $1", [plan.case_id])
      throw new AppError(409, 'PLAN_STALE', 'Facts changed since the plan was built. Run a fresh analysis.')
    }

    const operationId = uuid()
    const payload = {
      amount: { currency_code: plan.currency, value: centsToDecimal(plan.amount_cents) },
      invoice_id: `ER-${operationId}`,
      note_to_payer: 'Merchant unable to fulfill booking.',
    }
    await tx.query(
      `INSERT INTO money_operations (id, workspace_id, case_id, capture_id, plan_id, kind, request_id, payload,
         payload_hash, amount_cents, currency, state)
       VALUES ($1,$2,$3,$4,$5,'FULL_REFUND',$6,$7::jsonb,$8,$9,$10,'QUEUED')`,
      [operationId, workspaceId, plan.case_id, plan.capture_id, plan.id, uuid(), json(payload),
        sha256(stableStringify(payload)), plan.amount_cents, plan.currency],
    )
    await tx.query("UPDATE recovery_plans SET state = 'CONSUMED', consumed_at = now() WHERE id = $1", [plan.id])
    await tx.query("UPDATE recovery_cases SET state = 'EXECUTING', updated_at = now() WHERE id = $1", [plan.case_id])
    await enqueueJob(tx, {
      workspaceId,
      type: 'EXECUTE_REFUND',
      payload: { operationId },
      dedupeKey: `refund:${operationId}`,
    })
    await audit(tx, {
      workspaceId,
      bookingId: cases[0].booking_id,
      caseId: plan.case_id,
      type: 'PLAN_ACCEPTED',
      source: 'OPERATOR',
      summary: `Operator accepted the plan. Refund of ${payload.amount.value} ${plan.currency} queued with a persisted request ID.`,
      data: { operationId, planId: plan.id },
    })
    return { operationId, existing: false }
  })
}

/** Operator "Check status": makes the existing job due now. Never creates a new intent. */
export async function requestReconcile(workspaceId: string, caseId: string): Promise<void> {
  const db = await getDb()
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM money_operations WHERE case_id = $1 AND workspace_id = $2',
    [caseId, workspaceId],
  )
  if (!rows[0]) throw new AppError(409, 'NO_OPERATION', 'Nothing to reconcile yet')
  await bumpJob(db, `refund:${rows[0].id}`)
}

export async function armFault(workspaceId: string, caseId: string): Promise<void> {
  const db = await getDb()
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM recovery_cases WHERE id = $1 AND workspace_id = $2',
    [caseId, workspaceId],
  )
  if (!rows[0]) throw notFound()
  const { rows: ops } = await db.query<{ id: string }>('SELECT id FROM money_operations WHERE case_id = $1', [caseId])
  if (ops[0]) throw new AppError(409, 'ALREADY_EXECUTING', 'Arm the fault before issuing the refund')
  await db.query(
    `INSERT INTO armed_faults (id, workspace_id, case_id, fault) VALUES ($1, $2, $3, 'DROP_REFUND_RESPONSE')
     ON CONFLICT (case_id, fault) DO NOTHING`,
    [uuid(), workspaceId, caseId],
  )
}
