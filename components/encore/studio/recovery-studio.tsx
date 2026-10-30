'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { AgStudio, AgStudioProvider, createWidgets } from 'ag-studio-react'
import {
  enableStudioDevValidations,
  studioTheme,
  type AgReportState,
  type AgStudioStateUpdatedEvent,
  type AgWidgetsConfig,
} from 'ag-studio'
import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react'
import {
  CASES_SOURCE,
  RECEIPTS_SOURCE,
  toCaseRows,
  toReceiptRows,
} from '@/lib/studio/datasets'
import type { CaseSummary, ReceiptSummary } from '@/lib/view-types'
import { RecoveryPreviewWidget } from './recovery-preview-widget'
import { EvidenceReceiptWidget } from './evidence-receipt-widget'

if (process.env.NODE_ENV !== 'production') enableStudioDevValidations()

// Layout preferences only. Financial state is always re-read from the server.
const VIEW_STORAGE_KEY = 'encore:studio-view:v1'

const theme = studioTheme.withParams({
  accentColor: '#006c67',
  backgroundColor: '#ffffff',
  foregroundColor: '#142b35',
  borderColor: '#d7dedc',
  fontFamily: 'var(--font-sans), system-ui, sans-serif',
})

const DEFAULT_VIEW = {
  pages: [
    {
      id: 'recovery',
      name: 'Recovery',
      widgets: {
        preview: { type: 'encoreRecoveryPreview', dataMapping: {} },
        queue: {
          type: 'grid',
          dataMapping: {
            cols: [
              { id: `${CASES_SOURCE}.code` },
              { id: `${CASES_SOURCE}.title` },
              { id: `${CASES_SOURCE}.status` },
              { id: `${CASES_SOURCE}.amountUsd` },
              { id: `${CASES_SOURCE}.updatedAt` },
            ],
          },
          format: { title: { enabled: true, text: 'Case queue' } },
        },
        receipts: { type: 'encoreEvidenceReceipt', dataMapping: {} },
      },
      widgetLayout: {
        preview: { xTrack: 0, yTrack: 0, xSpan: 10, ySpan: 24 },
        queue: { xTrack: 10, yTrack: 0, xSpan: 14, ySpan: 24 },
        receipts: { xTrack: 0, yTrack: 24, xSpan: 24, ySpan: 18 },
      },
    },
  ],
  selectedPageId: 'recovery',
  panels: { filters: { collapsed: true }, data: { collapsed: true }, edit: { collapsed: true } },
} as unknown as AgReportState

function loadSavedView(): AgReportState | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as AgReportState
    return Array.isArray(parsed?.pages) && parsed.pages.length > 0 ? parsed : undefined
  } catch {
    return undefined
  }
}

const widgets = ((defaults: AgWidgetsConfig) =>
  createWidgets({
    additionalTypes: [
      {
        id: 'encoreRecoveryPreview',
        label: 'Recovery preview',
        icon: { url: '/icons/recovery-preview.svg' },
        form: (params: { createDefaults: (o: { dataMappingItems: [] }) => unknown }) =>
          params.createDefaults({ dataMappingItems: [] }),
        comp: RecoveryPreviewWidget,
        defaultSize: { width: 420, height: 320 },
        minSize: { width: 280, height: 240 },
        ai: { description: 'The highest-priority recovery case in the current view, with a link to resolve it.' },
      },
      {
        id: 'encoreEvidenceReceipt',
        label: 'Evidence receipts',
        icon: { url: '/icons/evidence-receipt.svg' },
        form: (params: { createDefaults: (o: { dataMappingItems: [] }) => unknown }) =>
          params.createDefaults({ dataMappingItems: [] }),
        comp: EvidenceReceiptWidget,
        defaultSize: { width: 640, height: 260 },
        minSize: { width: 280, height: 200 },
        ai: { description: 'Verified refund receipts for cases in the current view.' },
      },
    ],
    menu: [{ label: 'Encore', widgetIds: ['encoreRecoveryPreview', 'encoreEvidenceReceipt'] }, ...defaults.menu],
  } as never)) as never

interface RecoveryStudioProps {
  licenseKey?: string
  cases: CaseSummary[]
  receipts: ReceiptSummary[]
}

export function RecoveryStudio({ licenseKey, cases, receipts }: RecoveryStudioProps) {
  const studioRef = useRef<AgStudio>(null)
  const [editing, setEditing] = useState(false)
  const [initialView] = useState(() => loadSavedView() ?? DEFAULT_VIEW)
  const [customized, setCustomized] = useState(() => loadSavedView() !== undefined)

  const data = useMemo(
    () => ({
      sources: [
        { id: CASES_SOURCE, data: toCaseRows(cases) },
        { id: RECEIPTS_SOURCE, data: toReceiptRows(receipts) },
      ],
    }),
    [cases, receipts],
  )

  const editingRef = useRef(editing)
  editingRef.current = editing

  // Layout only changes in edit mode; ignoring other updates keeps a reset from re-saving itself.
  const onStateUpdated = useCallback((event: AgStudioStateUpdatedEvent) => {
    if (!editingRef.current) return
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(event.api.getState()))
      setCustomized(true)
    } catch {
      // Storage may be unavailable (private mode); the view still works for this visit.
    }
  }, [])

  const resetView = useCallback(() => {
    window.localStorage.removeItem(VIEW_STORAGE_KEY)
    studioRef.current?.api.setState(DEFAULT_VIEW)
    setCustomized(false)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-ink-muted">
          Built with AG Studio. Views and filters are yours to change; amounts and refunds stay server-verified.
        </p>
        <div className="flex items-center gap-2">
          {customized && !editing ? (
            <button
              type="button"
              onClick={resetView}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-surface-subdued hover:text-ink"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Reset view
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-subdued"
          >
            {editing ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            )}
            {editing ? 'Done' : 'Customize view'}
          </button>
        </div>
      </div>

      <div className="h-[min(80vh,820px)] min-h-[560px] overflow-hidden rounded-xl border border-line bg-surface">
        <AgStudioProvider licenseKey={licenseKey}>
          <AgStudio
            ref={studioRef}
            style={{ height: '100%', width: '100%' }}
            theme={theme}
            data={data}
            initialState={initialView}
            widgets={widgets}
            mode={editing ? 'edit' : 'view'}
            onStateUpdated={onStateUpdated}
          />
        </AgStudioProvider>
      </div>
    </div>
  )
}
