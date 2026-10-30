const fmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

export function fmtTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return `${fmt.format(d)} UTC`
}

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return (typeof value === 'string' ? new Date(value) : value).toISOString()
}
