'use client'

import { ChevronLeft, ChevronRight, RotateCcw, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EvidenceEvent } from '@/lib/view-types'

// ReplayStepper: read-only chronological snapshots with Previous / Next /
// Return to latest. Financial action controls are absent while replay is
// active (plan section 21).
export function ReplayStepper({
  events,
  activeIndex,
  onSelect,
}: {
  events: EvidenceEvent[]
  activeIndex: number | null
  onSelect: (index: number | null) => void
}) {
  const replaying = activeIndex !== null

  return (
    <section aria-labelledby="replay-heading" className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="replay-heading" className="text-sm font-semibold text-ink">
          Recorded sequence
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!replaying || activeIndex === 0}
            onClick={() => onSelect((activeIndex ?? events.length) - 1)}
            className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-medium text-link disabled:text-ink-muted/50"
          >
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </button>
          <button
            type="button"
            disabled={!replaying || activeIndex === events.length - 1}
            onClick={() => onSelect((activeIndex ?? -1) + 1)}
            className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-medium text-link disabled:text-ink-muted/50"
          >
            Next
            <ChevronRight aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            disabled={!replaying}
            onClick={() => onSelect(null)}
            className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-medium text-link disabled:text-ink-muted/50"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Return to latest
          </button>
        </div>
      </div>

      {replaying && (
        <p
          role="status"
          className="mt-2 flex items-center gap-2 rounded-lg bg-surface-subdued px-3 py-2 text-xs font-medium text-ink-body"
        >
          <Eye aria-hidden className="size-3.5 text-link" />
          Viewing recorded evidence — no actions will run while replay is active.
        </p>
      )}

      <ol className="mt-3 space-y-1">
        {events.map((event, i) => {
          const isActive = replaying ? i === activeIndex : i === events.length - 1
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  isActive ? 'bg-surface-subdued' : 'hover:bg-surface-subdued/60',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    isActive ? 'bg-action' : 'bg-line',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{event.label}</span>
                  <span className="block text-xs text-ink-muted">
                    {event.source} · {event.time}
                  </span>
                  {isActive && (
                    <span className="mt-1 block text-xs leading-relaxed text-ink-body">
                      {event.summary}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 px-3 text-[11px] text-ink-muted">Replay is read-only evidence.</p>
    </section>
  )
}
