// Exact-money helpers (addendum C.11). Integer cents everywhere; provider
// decimal strings are parsed with a strict regex and integer arithmetic only.

const DECIMAL_RE = /^(\d{1,7})(?:\.(\d{1,2}))?$/

export function centsToDecimal(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid cents: ${cents}`)
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export function decimalToCents(value: string): number {
  const match = DECIMAL_RE.exec(value)
  if (!match) throw new Error(`Invalid money string: ${value}`)
  const whole = parseInt(match[1], 10)
  const frac = match[2] ? parseInt(match[2].padEnd(2, '0'), 10) : 0
  return whole * 100 + frac
}

/** Provider amount equals our cents exactly (string compare after normalising). */
export function amountMatches(value: string | undefined, cents: number): boolean {
  if (!value) return false
  try {
    return decimalToCents(value) === cents
  } catch {
    return false
  }
}

export function formatMoney(amountCents: number, currency: string): string {
  const sign = amountCents < 0 ? '-' : ''
  const abs = Math.abs(amountCents)
  const whole = Math.trunc(abs / 100).toLocaleString('en-US')
  const symbol = currency === 'USD' ? '$' : `${currency} `
  return `${sign}${symbol}${whole}.${String(abs % 100).padStart(2, '0')}`
}

/** Customer charge remaining: capture minus distinct completed refunds, floored at 0 (C.11). */
export function remainingCharge(
  captureCents: number,
  completedRefunds: { refundId: string; cents: number }[],
): { remainingCents: number; reviewRequired: boolean } {
  const seen = new Set<string>()
  let refunded = 0
  for (const r of completedRefunds) {
    if (seen.has(r.refundId)) continue
    seen.add(r.refundId)
    refunded += r.cents
  }
  const raw = captureCents - refunded
  return { remainingCents: Math.max(0, raw), reviewRequired: raw < 0 }
}
