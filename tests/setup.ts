// Tests always run in fixture mode on an in-memory embedded Postgres.
process.env.APP_MODE = 'fixture'
process.env.DEPLOYMENT_TARGET = 'local'
process.env.PGLITE_DIR = 'memory://'
process.env.FIXTURE_REFUND_COMPLETE_MS = '0'
delete process.env.DATABASE_URL
