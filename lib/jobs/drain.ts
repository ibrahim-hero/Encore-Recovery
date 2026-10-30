import { getDb } from '@/lib/db/client'
import { runAnalysis } from '@/lib/domain/analysis'
import { runRefundJob } from './refund-job'
import type { JobResult } from './types'

type JobRow = {
  id: string
  type: 'EXECUTE_REFUND' | 'RUN_ANALYSIS'
  payload: Record<string, string>
  attempts: number
  max_attempts: number
}

const inFlight = new Map<string, Promise<number>>()

async function runJob(job: JobRow): Promise<JobResult> {
  if (job.type === 'EXECUTE_REFUND') return runRefundJob(job.payload.operationId)
  if (job.type === 'RUN_ANALYSIS') {
    await runAnalysis(job.payload.analysisId)
    return { done: true }
  }
  return { done: true }
}

/**
 * Durable outbox drain (addendum C.1). The DB is the queue; leases coordinate
 * workers; provider idempotency and immutable intents protect the money boundary.
 * Invoked by the Render worker loop, the internal drain route, and after() hooks.
 */
export async function drainJobs(opts: { workerId?: string; max?: number; workspaceId?: string; budgetMs?: number } = {}): Promise<number> {
  const key = opts.workspaceId ?? '*'
  const existing = inFlight.get(key)
  if (existing) return existing
  const p = drainOnce(opts).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

async function drainOnce({
  workerId = `web-${process.pid}`,
  max = 10,
  workspaceId,
  budgetMs = 25_000,
}: { workerId?: string; max?: number; workspaceId?: string; budgetMs?: number }): Promise<number> {
  const db = await getDb()
  const started = Date.now()
  let processed = 0

  while (processed < max && Date.now() - started < budgetMs) {
    const { rows } = await db.query<JobRow>(
      `UPDATE outbox_jobs SET state = 'LEASED', lease_owner = $1, lease_until = now() + interval '60 seconds',
         attempts = attempts + 1, updated_at = now()
       WHERE id = (
         SELECT id FROM outbox_jobs
         WHERE state IN ('READY','LEASED') AND available_at <= now()
           AND (lease_until IS NULL OR lease_until < now())
           AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
         ORDER BY available_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, type, payload, attempts, max_attempts`,
      [workerId, workspaceId ?? null],
    )
    const job = rows[0]
    if (!job) break
    processed++

    let result: JobResult
    try {
      result = await runJob(job)
    } catch (err) {
      console.error('[encore] job failed', job.type, job.id, err)
      result = { retryInMs: Math.min(60_000, 2 ** job.attempts * 1_000), note: (err as Error).message }
    }

    if ('done' in result) {
      await db.query(
        "UPDATE outbox_jobs SET state = 'DONE', lease_owner = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
        [job.id],
      )
    } else if (job.attempts >= job.max_attempts) {
      await db.query(
        "UPDATE outbox_jobs SET state = 'DEAD', last_error = $2, lease_owner = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
        [job.id, result.note ?? 'max attempts'],
      )
    } else {
      await db.query(
        `UPDATE outbox_jobs SET state = 'READY', available_at = now() + ($2::int * interval '1 millisecond'),
           last_error = $3, lease_owner = NULL, lease_until = NULL, updated_at = now() WHERE id = $1`,
        [job.id, result.retryInMs, result.note ?? null],
      )
    }
  }

  await db.query(
    `INSERT INTO worker_heartbeats (worker_id, last_seen_at, jobs_processed) VALUES ($1, now(), $2)
     ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = now(), jobs_processed = worker_heartbeats.jobs_processed + $2`,
    [workerId, processed],
  )
  return processed
}
