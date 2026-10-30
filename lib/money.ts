// Exact-money display helpers (plan section 19: tabular numerals, integer cents).
// Backend projections will supply integer cents; never parse floats here.

export function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountCents / 100)
}
