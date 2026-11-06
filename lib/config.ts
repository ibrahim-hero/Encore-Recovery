import { z } from 'zod'

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined))

const envSchema = z.object({
  APP_MODE: z.enum(['fixture', 'sandbox']).default('fixture'),
  DEPLOYMENT_TARGET: z.enum(['local', 'vercel', 'render']).optional(),
  APP_ORIGIN: optional,
  DATABASE_URL: optional,
  PGLITE_DIR: optional,
  PAYPAL_CLIENT_ID: optional,
  PAYPAL_CLIENT_SECRET: optional,
  PAYPAL_MERCHANT_ID: optional,
  PAYPAL_WEBHOOK_ID: optional,
  INTERNAL_JOB_TOKEN: optional,
  // Free AI Gateway tier blocks frontier models, so the primary is one that works there.
  AI_MODEL: z.string().default('openai/gpt-5-mini'),
  // Tried in order when the primary is unavailable.
  AI_FALLBACK_MODELS: z.string().default('google/gemini-2.5-flash'),
  FIXTURE_REFUND_COMPLETE_MS: z.coerce.number().int().min(0).default(4000),
})

export type AppConfig = z.infer<typeof envSchema> & {
  deploymentTarget: 'local' | 'vercel' | 'render'
  databaseKind: 'pg' | 'pglite'
  missing: string[]
}

export const FIXTURE_MERCHANT_ID = 'FIXTUREMERCHANT01'

let cached: AppConfig | undefined

export function getConfig(): AppConfig {
  if (cached) return cached
  // The PAYPAL_US_* trio (US Business sandbox account) overrides the original variables when set.
  const pick = (us: string | undefined, base: string | undefined) => (us && us.trim() ? us : base)
  const env = envSchema.parse({
    ...process.env,
    PAYPAL_CLIENT_ID: pick(process.env.PAYPAL_US_CLIENT_ID, process.env.PAYPAL_CLIENT_ID),
    PAYPAL_CLIENT_SECRET: pick(process.env.PAYPAL_US_CLIENT_SECRET, process.env.PAYPAL_CLIENT_SECRET),
    PAYPAL_MERCHANT_ID: pick(process.env.PAYPAL_US_MERCHANT_ID, process.env.PAYPAL_MERCHANT_ID),
  })
  const deploymentTarget = env.DEPLOYMENT_TARGET ?? (process.env.VERCEL ? 'vercel' : 'local')

  if (env.APP_MODE === 'fixture' && deploymentTarget === 'render') {
    throw new Error('APP_MODE=fixture is not allowed when DEPLOYMENT_TARGET=render')
  }

  const missing: string[] = []
  if (env.APP_MODE === 'sandbox') {
    for (const key of ['DATABASE_URL', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_MERCHANT_ID'] as const) {
      if (!env[key]) missing.push(key)
    }
    if (missing.length) {
      throw new Error(`APP_MODE=sandbox requires: ${missing.join(', ')}`)
    }
  } else {
    for (const key of ['DATABASE_URL', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_MERCHANT_ID', 'PAYPAL_WEBHOOK_ID'] as const) {
      if (!env[key]) missing.push(key)
    }
  }

  cached = {
    ...env,
    deploymentTarget,
    databaseKind: env.DATABASE_URL ? 'pg' : 'pglite',
    missing,
  }
  return cached
}

export function isSandbox(): boolean {
  return getConfig().APP_MODE === 'sandbox'
}

export function expectedMerchantId(): string {
  const c = getConfig()
  return c.APP_MODE === 'sandbox' ? c.PAYPAL_MERCHANT_ID! : FIXTURE_MERCHANT_ID
}
