import { cn } from '@/lib/utils'

// Encore mark: an "E" built from three bars (booking, fulfillment, PayPal).
// The middle bar is split and bridged, which is the product in one shape: two
// sources that disagree, then reconnect once the refund is verified.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="7" className="fill-action" />
      <rect x="9" y="8" width="3.2" height="16" rx="0.8" fill="#fff" />
      <rect x="9" y="8" width="14" height="3.2" rx="0.8" fill="#fff" />
      <rect x="9" y="20.8" width="14" height="3.2" rx="0.8" fill="#fff" />
      <rect x="9" y="14.4" width="6.2" height="3.2" rx="0.8" fill="#fff" />
      <rect x="17.4" y="14.4" width="2" height="3.2" rx="0.6" fill="#fff" fillOpacity="0.55" />
      <rect x="21" y="14.4" width="2" height="3.2" rx="0.6" fill="#fff" fillOpacity="0.55" />
    </svg>
  )
}

export function Wordmark({ compact = false, tone = 'dark' }: { compact?: boolean; tone?: 'dark' | 'light' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span
            className={cn('font-heading text-[17px] font-extrabold tracking-tight', tone === 'light' ? 'text-surface' : 'text-ink')}
          >
            Encore
          </span>
          <span
            className={cn(
              'mt-1 text-[10px] font-semibold uppercase tracking-[0.2em]',
              tone === 'light' ? 'text-surface/60' : 'text-ink-muted',
            )}
          >
            Recovery
          </span>
        </span>
      )}
    </span>
  )
}

export function ReconnectGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 28 6"
      className={cn('h-1.5 w-7 text-action', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <line x1="1" y1="3" x2="9" y2="3" />
      <line x1="11.5" y1="3" x2="16.5" y2="3" strokeDasharray="2 2" />
      <line x1="19" y1="3" x2="27" y2="3" />
    </svg>
  )
}
