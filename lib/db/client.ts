import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getConfig } from '@/lib/config'
import { runMigrations } from './migrate'
import { seed } from './seed'

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export interface Database extends Queryable {
  kind: 'pg' | 'pglite'
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>
  /** Runs fn on one dedicated connection (needed for session-level advisory locks). */
  withConnection<T>(fn: (q: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

type GlobalDb = { __encoreDb?: Promise<Database> }
const g = globalThis as GlobalDb

async function createPg(url: string): Promise<Database> {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 })
  const query: Queryable['query'] = async (text, params) => {
    const res = await pool.query(text, params as unknown[])
    return { rows: res.rows }
  }
  return {
    kind: 'pg',
    query,
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const out = await fn({
          query: async (text, params) => ({ rows: (await client.query(text, params as unknown[])).rows }),
        })
        await client.query('COMMIT')
        return out
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },
    async withConnection(fn) {
      const client = await pool.connect()
      try {
        return await fn({
          query: async (text, params) => ({ rows: (await client.query(text, params as unknown[])).rows }),
        })
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

async function createPglite(dir: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite')
  // PGlite does not create missing parent directories itself.
  if (dir !== 'memory://') await mkdir(dir, { recursive: true })
  const db = dir === 'memory://' ? new PGlite() : new PGlite(dir)
  await db.waitReady
  const query: Queryable['query'] = async (text, params) => {
    const res = await db.query(text, params as unknown[])
    return { rows: res.rows as never[] }
  }
  return {
    kind: 'pglite',
    query,
    async tx(fn) {
      return db.transaction(async (t) =>
        fn({ query: async (text, params) => ({ rows: (await t.query(text, params as unknown[])).rows as never[] }) }),
      )
    },
    withConnection: (fn) => fn({ query }),
    close: () => db.close(),
  }
}

function defaultPgliteDir(): string {
  const c = getConfig()
  if (c.PGLITE_DIR) return c.PGLITE_DIR
  // Outside the project tree (never touches watched source); writable on serverless too.
  return path.join(tmpdir(), 'encore-pglite')
}

export function getDb(): Promise<Database> {
  if (!g.__encoreDb) {
    g.__encoreDb = (async () => {
      const c = getConfig()
      const db = c.DATABASE_URL ? await createPg(c.DATABASE_URL) : await createPglite(defaultPgliteDir())
      await runMigrations(db)
      await seed(db)
      return db
    })().catch((err) => {
      g.__encoreDb = undefined
      throw err
    })
  }
  return g.__encoreDb
}

/** Test helper: replace the process-wide database. */
export async function resetDbForTests(): Promise<void> {
  const existing = g.__encoreDb
  g.__encoreDb = undefined
  if (existing) await (await existing).close().catch(() => {})
}

export function json(value: unknown): string {
  return JSON.stringify(value ?? null)
}
