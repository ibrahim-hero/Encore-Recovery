import type { CaseStatus, CaseSummary, ReceiptSummary } from '@/lib/view-types'

// Studio receives only these display-safe projections of the workspace's own
// cases and receipts. No credentials, provider payloads, or mutable money state.

export const CASES_SOURCE = 'cases'
export const RECEIPTS_SOURCE = 'receipts'

export const STATUS_LABEL: Record<CaseStatus, string> = {
  NEEDS_RESOLUTION: 'Needs resolution',
  REFUND_PENDING: 'Refund pending',
  RESOLVED: 'Resolved',
}

export interface CaseRow {
  caseId: string
  code: string
  title: string
  status: string
  amountUsd: number
  currency: string
  updatedAt: string
}

export interface ReceiptRow {
  caseId: string
  code: string
  version: number
  refundId: string
  refundUsd: number
  currency: string
  verifiedAgainst: string
  generatedAt: string
}

export const CASE_FIELDS = ['caseId', 'code', 'title', 'status', 'amountUsd', 'currency', 'updatedAt'] as const
export const RECEIPT_FIELDS = [
  'caseId',
  'code',
  'version',
  'refundId',
  'refundUsd',
  'currency',
  'verifiedAgainst',
  'generatedAt',
] as const

export function toCaseRows(cases: CaseSummary[]): CaseRow[] {
  return cases.map((c) => ({
    caseId: c.id,
    code: c.code,
    title: c.title,
    status: STATUS_LABEL[c.status],
    amountUsd: c.amountCents / 100,
    currency: c.currency,
    updatedAt: c.updatedAt,
  }))
}

export function toReceiptRows(receipts: ReceiptSummary[]): ReceiptRow[] {
  return receipts.map((r) => ({
    caseId: r.caseId,
    code: r.code,
    version: r.version,
    refundId: r.refundId,
    refundUsd: r.refundCents / 100,
    currency: r.currency,
    verifiedAgainst: r.verifiedAgainst,
    generatedAt: r.generatedAt,
  }))
}

/** Studio row keys may be the bare field name or the qualified `source.field` id. */
export function readRow<T extends string>(row: Record<string, unknown>, source: string, fields: readonly T[]) {
  const out = {} as Record<T, unknown>
  for (const f of fields) out[f] = row[f] ?? row[`${source}.${f}`]
  return out
}

export function formatUsd(value: unknown, currency = 'USD') {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}
