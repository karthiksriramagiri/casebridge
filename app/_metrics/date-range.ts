'use client'

import { useCallback, useEffect, useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   The date range, shared across the Creative Center.

   Each tab is its own route, so component state cannot carry the selection
   between them — picking "14d" on Creative Analysis and landing on Winner
   Analysis showing today is the kind of thing that makes two pages quietly
   disagree. The choice is therefore held in localStorage and mirrored into
   the URL: the URL so a range can be linked and shared, localStorage so it
   survives a plain click through the nav.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DATE_PRESETS = [
  { label: 'Today',  value: 'today' },
  { label: 'Yest.',  value: 'yesterday' },
  { label: '7d',     value: 'last_7d' },
  { label: '14d',    value: 'last_14d' },
  { label: '30d',    value: 'last_30d' },
  { label: 'Custom', value: 'custom' },
] as const

export type PresetValue = typeof DATE_PRESETS[number]['value']

export interface DateRange {
  preset: PresetValue
  /** Only meaningful when preset === 'custom'. YYYY-MM-DD. */
  start: string
  end: string
}

const KEY = 'cb.creative.range'

export const todayISO = () => new Date().toLocaleDateString('en-CA')

export function shiftDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return dt.toLocaleDateString('en-CA')
}

/** The query string the insights routes expect for a given range. */
export function rangeQuery(r: DateRange): string {
  if (r.preset === 'custom' && r.start && r.end) {
    return `start_date=${r.start}&end_date=${r.end}`
  }
  return `date_preset=${r.preset}`
}

/** Human label for the current selection, for headings and empty states. */
export function rangeLabel(r: DateRange): string {
  if (r.preset === 'custom' && r.start && r.end) {
    return r.start === r.end ? r.start : `${r.start} → ${r.end}`
  }
  return DATE_PRESETS.find(p => p.value === r.preset)?.label ?? r.preset
}

function readInitial(): DateRange {
  const fallback: DateRange = { preset: 'today', start: todayISO(), end: todayISO() }
  if (typeof window === 'undefined') return fallback

  // URL wins over storage: a shared link must show what the sender saw.
  const sp = new URLSearchParams(window.location.search)
  const urlPreset = sp.get('range') as PresetValue | null
  const urlStart = sp.get('from') || ''
  const urlEnd = sp.get('to') || ''
  if (urlPreset && DATE_PRESETS.some(p => p.value === urlPreset)) {
    return {
      preset: urlPreset,
      start: urlStart || fallback.start,
      end: urlEnd || fallback.end,
    }
  }

  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as DateRange
      if (DATE_PRESETS.some(p => p.value === saved.preset)) {
        return { preset: saved.preset, start: saved.start || fallback.start, end: saved.end || fallback.end }
      }
    }
  } catch { /* a corrupt entry is not worth failing the page over */ }

  return fallback
}

export function useDateRange() {
  /* Server and first client render must agree, so the stored value is applied
     in an effect rather than read during render — otherwise the markup
     hydrates with today and React complains. */
  const [range, setRangeState] = useState<DateRange>({
    preset: 'today', start: todayISO(), end: todayISO(),
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setRangeState(readInitial())
    setReady(true)
  }, [])

  const setRange = useCallback((next: Partial<DateRange>) => {
    setRangeState(prev => {
      const merged = { ...prev, ...next }
      try { window.localStorage.setItem(KEY, JSON.stringify(merged)) } catch {}
      const url = new URL(window.location.href)
      url.searchParams.set('range', merged.preset)
      if (merged.preset === 'custom') {
        url.searchParams.set('from', merged.start)
        url.searchParams.set('to', merged.end)
      } else {
        url.searchParams.delete('from')
        url.searchParams.delete('to')
      }
      window.history.replaceState(null, '', url)
      return merged
    })
  }, [])

  return { range, setRange, ready }
}
