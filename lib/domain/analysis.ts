import { AnalysisError, generateDiagnosis, validateDiagnosis, type DiagnosisGenerator } from '@/lib/ai/adapter'
import { getConfig } from '@/lib/config'
import { uuid } from '@/lib/crypto'
import { getDb, json } from '@/lib/db/client'
import { AppError, notFound } from '@/lib/http'
import { audit, enqueueJob } from './audit'
import { evaluateEligibility, planFingerprint } from './eligibility'
import { loadCaseContext } from './snapshot'

const PLAN_TTL_MINUTES = 15
const BLOCKED_STATES = ['EXECUTING', 'VERIFYING', 'RESOLVED_REFUNDED']

export async function requestAnalysis(workspaceId: string, caseId: string): Promise<{ analysisId: string }> {
  const db = await getDb()
  return db.tx(async (tx) => {
    const { rows } = await tx.query<{ id: string; state: string; booking_id: string }>(
      'SELECT id, state, booking_id FROM recovery_cases WHERE id = $1 AND workspace_id = $2 FOR UPDATE',
      [caseId, workspaceId],
    )
    const c = rows[0]
    if (!c) throw notFound()
    if (BLOCKED_STATES.includes(c.state)) throw new AppError(409, 'CASE_LOCKED', `Case is ${c.state}`)
    const { rows: running } = await tx.query<{ id: string }>(
      "SELECT id FROM analyses WHERE case_id = $1 AND state IN ('QUEUED','RUNNING')",
      [caseId],
    )
    if (running[0]) return { analysisId: running[0].id }

    await tx.query("UPDATE recovery_plans SET state = 'STALE' WHERE case_id = $1 AND state = 'READY'", [caseId])
    const analysisId = uuid()
    await tx.query(
      "INSERT INTO analyses (id, workspace_id, case_id, state, model) VALUES ($1, $2, $3, 'QUEUED', $4)",
      [analysisId, workspaceId, caseId, getConfig().AI_MODEL],
    )
    await tx.query(
      "UPDATE recovery_cases SET state = 'ANALYZING', review_reason = NULL, updated_at = now() WHERE id = $1",
      [caseId],
    )
    await enqueueJob(tx, { workspaceId, type: 'RUN_ANALYSIS', payload: { analysisId }, dedupeKey: `analysis:${analysisId}` })
    await audit(tx, {
      workspaceId,
      bookingId: c.booking_id,
      caseId,
      type: 'ANALYSIS_REQUESTED',
      source: 'OPERATOR',
      summary: 'Operator requested an AI diagnosis.',
    })
    return { analysisId }
  })
}

const CASE_STATE_FOR: Record<string, string> = {
  NEEDS_INFORMATION: 'NEEDS_INFORMATION',
  WAIT_FOR_PAYMENT: 'OPEN',
  NO_ACTION: 'OPEN',
  MANUAL_REVIEW: 'REVIEW_REQUIRED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  EXISTING_OPERATION: 'REVIEW_REQUIRED',
}

export async function runAnalysis(analysisId: string, generate: DiagnosisGenerator = generateDiagnosis): Promise<void> {
  const db = await getDb()
  const { rows } = await db.query<{ id: string; workspace_id: string; case_id: string; state: string }>(
    "UPDATE analyses SET state = 'RUNNING' WHERE id = $1 AND state IN ('QUEUED','RUNNING') RETURNING id, workspace_id, case_id, state",
    [analysisId],
  )
  const a = rows[0]
  if (!a) return
  const ctx = await loadCaseContext(db, a.case_id, a.workspace_id)
  if (!ctx) return
  await db.query('UPDATE analyses SET snapshot = $2::jsonb WHERE id = $1', [analysisId, json(ctx.snapshot)])
  const bookingId = ctx.facts.booking.id

  let diagnosis
  try {
    const out = await generate(ctx.snapshot)
    // Defense in depth: re-validate even if the generator already did.
    const checked = validateDiagnosis(out.diagnosis, ctx.snapshot)
    if (!checked.ok) throw new AnalysisError('INVALID_OUTPUT', checked.error)
    diagnosis = checked.value
    await db.query('UPDATE analyses SET model = $2, repair_attempted = $3 WHERE id = $1', [analysisId, out.model, out.repaired])
  } catch (err) {
    const code = err instanceof AnalysisError ? err.code : 'ANALYSIS_ERROR'
    const message = (err as Error).message.slice(0, 300)
    await db.tx(async (tx) => {
      await tx.query(
        "UPDATE analyses SET state = 'FAILED', error_code = $2, error_message = $3, finished_at = now() WHERE id = $1",
        [analysisId, code, message],
      )
      await tx.query(
        "UPDATE recovery_cases SET state = 'OPEN', updated_at = now() WHERE id = $1 AND state = 'ANALYZING'",
        [a.case_id],
      )
      await audit(tx, {
        workspaceId: a.workspace_id,
        bookingId,
        caseId: a.case_id,
        type: 'ANALYSIS_FAILED',
        source: 'AI',
        summary: `AI diagnosis failed (${code}). No plan was created; facts remain readable.`,
      })
    })
    return
  }

  await db.tx(async (tx) => {
    // Re-read facts inside the transaction; the plan binds to what is true now.
    const fresh = await loadCaseContext(tx, a.case_id, a.workspace_id)
    if (!fresh) return
    const eligibility = evaluateEligibility(fresh.eligibilityInput)
    let caseState: string
    let reviewReason: string | null = null
    let planId: string | null = null

    if (diagnosis.disposition === 'PROPOSE_FULL_REFUND' && eligibility.eligible) {
      const cap = fresh.facts.capture!
      planId = uuid()
      await tx.query(
        `INSERT INTO recovery_plans (id, workspace_id, case_id, analysis_id, state, disposition, capture_id, amount_cents,
           currency, booking_revision, policy_id, fingerprint, summary, reason_codes, evidence, customer_message, expires_at)
         VALUES ($1,$2,$3,$4,'READY','PROPOSE_FULL_REFUND',$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,
           now() + interval '${PLAN_TTL_MINUTES} minutes')`,
        [
          planId, a.workspace_id, a.case_id, analysisId, cap.id,
          cap.amount_cents, // INV-02: amount comes from the verified capture, never the model.
          cap.currency, fresh.facts.booking.revision, fresh.policy.id,
          planFingerprint(fresh.eligibilityInput), diagnosis.summary, json(diagnosis.reasonCodes),
          json(diagnosis.evidence), diagnosis.customerMessageDraft,
        ],
      )
      caseState = 'READY'
    } else if (diagnosis.disposition === 'PROPOSE_FULL_REFUND' && !eligibility.eligible) {
      caseState = CASE_STATE_FOR[eligibility.outcome]
      reviewReason = `Rules rejected the AI proposal: ${eligibility.reason}`
    } else {
      caseState = CASE_STATE_FOR[diagnosis.disposition] ?? 'OPEN'
      if (caseState === 'REVIEW_REQUIRED') reviewReason = diagnosis.summary
    }

    await tx.query(
      "UPDATE analyses SET state = 'SUCCEEDED', output = $2::jsonb, finished_at = now() WHERE id = $1",
      [analysisId, json(diagnosis)],
    )
    await tx.query(
      'UPDATE recovery_cases SET state = $2, review_reason = $3, updated_at = now() WHERE id = $1',
      [a.case_id, caseState, reviewReason],
    )
    await audit(tx, {
      workspaceId: a.workspace_id,
      bookingId,
      caseId: a.case_id,
      type: 'ANALYSIS_COMPLETED',
      source: 'AI',
      summary: `${diagnosis.disposition}: ${diagnosis.summary}`,
      data: { planId, reasonCodes: diagnosis.reasonCodes },
    })
  })
}
