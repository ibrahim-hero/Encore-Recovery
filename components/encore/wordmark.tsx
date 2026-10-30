import { cn } from '@/lib/utils'

// Original Encore wordmark: "EN" plus a small three-segment line that reconnects
// (plan section 19, brand treatment).
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-ink text-[11px] font-bold tracking-tight text-surface"
      >
        EN
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-ink">Encore</span>
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-ink-muted">
            <ReconnectGlyph />
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
