import { sha256 } from '@/lib/crypto'
import type { Queryable } from './client'

export const POLICY_ID = 'merchant-unfulfillable:v1'

// PDF section 17, verbatim.
export const POLICY_V1_TEXT =
  "When the merchant has confirmed it cannot provide the booked service, and a matching completed PayPal capture exists with no previous or in-flight refund, refund the booking's captured gross amount to the original payer through the capture-refund API. Customer-only requests, uncertain payment state, conflicting financial activity, and missing evidence require information or review."

export const BOOKING_TEMPLATES = [
  { slug: 'community-presentation-54', title: 'Community presentation', amountCents: 5400, sortOrder: 1 },
  { slug: 'studio-workshop-120', title: 'Studio workshop', amountCents: 12000, sortOrder: 2 },
  { slug: 'gallery-tour-18', title: 'Guided gallery tour', amountCents: 1850, sortOrder: 3 },
] as const

export async function seed(db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO merchant_policies (id, version, title, body, content_hash)
     VALUES ($1, 'v1', 'Demo merchant policy v1', $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [POLICY_ID, POLICY_V1_TEXT, sha256(POLICY_V1_TEXT)],
  )
  for (const t of BOOKING_TEMPLATES) {
    await db.query(
      `INSERT INTO booking_templates (slug, title, amount_cents, currency, sort_order)
       VALUES ($1, $2, $3, 'USD', $4)
       ON CONFLICT (slug) DO NOTHING`,
      [t.slug, t.title, t.amountCents, t.sortOrder],
    )
  }
}
