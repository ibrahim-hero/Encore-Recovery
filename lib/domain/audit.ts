import { uuid } from '@/lib/crypto'
import { json, type Queryable } from '@/lib/db/client'
import { buildTruth, loadBookingFacts, toSnapshot } from './truth'

export type AuditSource = 'PAYPAL' | 'MERCHANT' | 'AI' | 'OPERATOR' | 'SYSTEM'

/** Append-only audit event with an immutable truth snapshot for replay (INV-10). */
export async function audit(
  q: Queryable,
  e: {
    workspaceId: string
    bookingId: string
    caseId?: string | null
    type: string
    source: AuditSource
    summary: string
    data?: Record<string, unknown>
  },
): Promise<void> {
  const snapshot = toSnapshot(buildTruth(await loadBookingFacts(q, e.bookingId)))
  await q.query(
    `INSERT INTO audit_events (id, workspace_id, booking_id, case_id, type, source, summary, data, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
    [uuid(), e.workspaceId, e.bookingId, e.caseId ?? null, e.type, e.source, e.summary, json(e.data ?? {}), json(snapshot)],
  )
}

export async function enqueueJob(
  q: Queryable,
  job: { workspaceId: string; type: 'EXECUTE_REFUND' | 'RUN_ANALYSIS'; payload: Record<string, unknown>; dedupeKey: string },
): Promise<void> {
  await q.query(
    `INSERT INTO outbox_jobs (id, workspace_id, type, payload, dedupe_key)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [uuid(), job.workspaceId, job.type, json(job.payload), job.dedupeKey],
  )
}

/** Make an existing job due now (reconcile request or verified webhook). Never creates a new intent. */
export async function bumpJob(q: Queryable, dedupeKey: string): Promise<void> {
  await q.query(
    `UPDATE outbox_jobs
     SET available_at = now(), state = CASE WHEN state = 'DONE' THEN 'READY' ELSE state END, updated_at = now()
     WHERE dedupe_key = $1 AND state IN ('READY', 'DONE')`,
    [dedupeKey],
  )
}
