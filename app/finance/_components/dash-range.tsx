'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { DASH_RANGES, PRESET_LABELS } from '@/lib/finance/reporting/filters'
import type { RangePreset } from '@/lib/finance/reporting/types'

/* ═══════════════════════════════════════════════════════════════════════════
   The dashboard's window picker.

   One dropdown, plus two date fields when the window is hand-picked. The
   same shape the Reporting Center uses, and for the same reason: the window
   lives in the query string, so the server rebuilds the figures and nothing
   is recomputed in the browser. A view can be sent to someone and opens the
   same way for them.

   Narrower than the Reporting Center's list on purpose. Today and Yesterday
   are on a dashboard whose revenue is invoiced — and invoices are raised
   once a month — so they would read as a company that earned nothing,
   which is a true number and a useless one.
   ═══════════════════════════════════════════════════════════════════════════ */

export function DashRange({
  preset, start, end, basePath,
}: {
  preset: RangePreset
  /** The resolved window, so the date fields open on what is on screen. */
  start: string
  end: string
  basePath: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const go = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params?.toString() ?? '')
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    /* Picking a named window throws away a hand-picked one — otherwise the
       old dates sit in the URL and come back the next time someone chooses
       Custom, showing a range they did not ask for. */
    if (patch.range && patch.range !== 'custom') {
      sp.delete('from')
      sp.delete('to')
    }
    /* Switching TO custom with no dates yet: seed it with the window
       already on screen, so the figures do not jump the moment it is
       chosen. */
    if (patch.range === 'custom' && !sp.get('from') && !sp.get('to')) {
      sp.set('from', start)
      sp.set('to', end)
    }
    const qs = sp.toString()
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath))
  }

  return (
    <div className="fin-filters" aria-busy={pending} style={{ marginBottom: 12 }}>
      <label className="fin-field">
        <span>Range</span>
        <select className="fin-select" value={preset} onChange={(e) => go({ range: e.target.value })}>
          {DASH_RANGES.map((k) => (
            <option key={k} value={k}>{PRESET_LABELS[k]}</option>
          ))}
        </select>
      </label>

      {preset === 'custom' && (
        <>
          <label className="fin-field">
            <span>From</span>
            <input
              type="date"
              className="fin-input"
              value={start}
              max={end}
              onChange={(e) => e.target.value && go({ from: e.target.value })}
            />
          </label>
          <label className="fin-field">
            <span>To</span>
            <input
              type="date"
              className="fin-input"
              value={end}
              min={start}
              onChange={(e) => e.target.value && go({ to: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  )
}
