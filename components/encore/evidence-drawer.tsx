'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { TruthFact } from '@/lib/fixtures'

// EvidenceDrawer: sanitized structured facts — source type, resource ID,
// observation time, and source hash/reference. Never raw secret-bearing JSON
// (plan sections 20 and 23).
export function EvidenceDrawer({
  fact,
  onClose,
}: {
  fact: TruthFact | null
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!fact) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fact, onClose])

  if (!fact) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`${fact.source} source evidence`}>
      <button
        type="button"
        aria-label="Close evidence drawer"
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
      />
      <div className="encore-fade relative flex w-full max-w-md flex-col border-l border-line bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{fact.source} source</h2>
            <p className="text-xs text-ink-muted">{fact.authority}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-subdued hover:text-ink"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <dl className="flex-1 divide-y divide-line overflow-y-auto px-5">
          {fact.facts.map((f) => (
            <div key={f.label} className="py-3">
              <dt className="text-xs font-medium tracking-wide text-ink-muted">{f.label}</dt>
              <dd className="tnum mt-0.5 text-sm text-ink-body">{f.value}</dd>
            </div>
          ))}
        </dl>
        <footer className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-muted">
          Structured facts only. Raw provider payloads and credentials are never exposed in the
          workspace.
        </footer>
      </div>
    </div>
  )
}
