import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Database } from './client'

const MIGRATION_LOCK = 727001

export async function runMigrations(db: Database): Promise<string[]> {
  const dir = path.join(process.cwd(), 'migrations')
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()

  return db.withConnection(async (conn) => {
    await conn.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])
    try {
      await conn.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      )
      const { rows } = await conn.query<{ name: string }>('SELECT name FROM schema_migrations')
      const applied = new Set(rows.map((r) => r.name))
      const ran: string[] = []
      for (const file of files) {
        if (applied.has(file)) continue
        const sql = await readFile(path.join(dir, file), 'utf8')
        await conn.query('BEGIN')
        try {
          for (const statement of splitSql(sql)) await conn.query(statement)
          await conn.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
          await conn.query('COMMIT')
          ran.push(file)
        } catch (err) {
          await conn.query('ROLLBACK').catch(() => {})
          throw new Error(`Migration ${file} failed: ${(err as Error).message}`)
        }
      }
      return ran
    } finally {
      await conn.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK])
    }
  })
}

// Migrations contain no functions or quoted semicolons, so a simple split is safe.
function splitSql(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}
