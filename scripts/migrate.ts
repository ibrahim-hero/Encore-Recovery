import { getDb } from '@/lib/db/client'

// getDb() applies pending migrations (advisory-locked) and the idempotent seed.
async function main() {
  const db = await getDb()
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name')
  console.log(`[encore] ${db.kind}: ${rows.length} migrations applied`)
  for (const r of rows) console.log(`  ${r.name}`)
  await db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
