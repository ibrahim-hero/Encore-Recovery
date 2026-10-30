'use client'

import { useEffect, useState } from 'react'
import type { AgWidgetDataQuery, AgWidgetParams, AgWidgetRowsResult } from 'ag-studio'

type RowsState = { status: 'loading' } | { status: 'ready'; rows: Record<string, unknown>[] } | { status: 'error' }

/**
 * Loads rows for a custom widget through Studio's data engine so page filters and
 * cross filters apply, and drives the documented display-state overlays.
 */
export function useWidgetRows(params: AgWidgetParams, source: string, fields: readonly string[], queryId: string) {
  const { widgetApi } = params
  const [state, setState] = useState<RowsState>({ status: 'loading' })
  const fieldKey = fields.join(',')

  useEffect(() => {
    let cancelled = false
    widgetApi.setDisplayState('loading', { prominent: state.status === 'loading' })
    const wanted = new Set(fieldKey.split(','))
    const table = widgetApi.getSchema().find((t) => t.id === source)
    const fields = (table?.fields ?? []).filter((f) =>
      wanted.has(String((f as { externalId?: unknown }).externalId)),
    )
    if (fields.length === 0) {
      widgetApi.setDisplayState('noData')
      return
    }
    const query: AgWidgetDataQuery = { kind: 'flat', fields }
    widgetApi
      .getData(query, { queryId })
      .then((response) => {
        if (cancelled) return
        const rows = (response.results as AgWidgetRowsResult).rows
        setState({ status: 'ready', rows })
        widgetApi.setDisplayState(rows.length ? 'displayed' : 'noData')
      })
      .catch(() => {
        if (cancelled) return
        setState({ status: 'error' })
        widgetApi.setDisplayState('displayed')
      })
    return () => {
      cancelled = true
    }
    // Re-query whenever Studio hands the widget new params (data, filters, format).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, widgetApi, source, fieldKey, queryId])

  return state
}
