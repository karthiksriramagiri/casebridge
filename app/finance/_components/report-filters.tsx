'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { COMPARISON_LABELS, GRANULARITY_LABELS, PRESET_LABELS } from '@/lib/finance/reporting/filters'
import type { ReportData } from '@/lib/finance/reporting/report-types'

/* The range, the grain and the comparison — in the URL, so a view can be
   sent to someone and open the same way for them. Every control writes to
   the query string and lets the server rebuild the report; nothing is
   recomputed in the browser, which is why the numbers here always match
   the export. */
export function ReportFilters({ report, basePath }: { report: ReportData; basePath: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const f = report.meta.filters

  const go = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params?.toString() ?? '')
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    /* A new range invalidates a hand-picked custom window; dropping the
       dates lets the preset decide them again. */
    if (patch.range && patch.range !== 'custom') {
      sp.delete('from')
      sp.delete('to')
    }
    start(() => router.push(`${basePath}?${sp.toString()}`))
  }

  return (
    <div className="fin-filters" aria-busy={pending}>
      {/* Which revenue the whole report is built on. First, because it
          changes the meaning of every figure below it. */}
      <label className="fin-field">
        <span>Revenue basis</span>
        <select className="fin-select" value={f.basis} onChange={(e) => go({ basis: e.target.value })}>
          <option value="cases">Cases delivered</option>
          <option value="invoiced">Invoiced</option>
        </select>
      </label>

      <label className="fin-field">
        <span>Range</span>
        <select className="fin-select" value={f.preset} onChange={(e) => go({ range: e.target.value })}>
          {Object.entries(PRESET_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>

      {f.preset === 'custom' && (
        <>
          <label className="fin-field">
            <span>From</span>
            <input type="date" className="fin-input" value={f.start}
                   onChange={(e) => e.target.value && go({ from: e.target.value })} />
          </label>
          <label className="fin-field">
            <span>To</span>
            <input type="date" className="fin-input" value={f.end}
                   onChange={(e) => e.target.value && go({ to: e.target.value })} />
          </label>
        </>
      )}

      <label className="fin-field">
        <span>Grain</span>
        <select className="fin-select" value={f.granularity} onChange={(e) => go({ granularity: e.target.value })}>
          {Object.entries(GRANULARITY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>

      <label className="fin-field">
        <span>Compare to</span>
        <select className="fin-select" value={f.comparison} onChange={(e) => go({ compare: e.target.value })}>
          {Object.entries(COMPARISON_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </label>

      <label className="fin-field">
        <span>Law firm</span>
        <select className="fin-select" value={f.firmId ?? ''}
                onChange={(e) => go({ firm: e.target.value || null, invoice: null })}>
          <option value="">All law firms</option>
          {report.meta.firms.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
      </label>

      <label className="fin-field">
        <span>Invoice</span>
        <select className="fin-select" value={f.invoiceId ?? ''}
                onChange={(e) => go({ invoice: e.target.value || null })}>
          <option value="">All invoices</option>
          {report.meta.invoiceOptions
            .filter((i) => !f.firmId || i.firmId === f.firmId)
            .map((i) => (
              <option key={i.id} value={i.id}>{i.number}</option>
            ))}
        </select>
      </label>

      <div className="grow">
        <a className="fin-btn" href={`/api/finance/report?${params?.toString() ?? ''}`} target="_blank" rel="noreferrer">
          Raw figures
        </a>
      </div>
    </div>
  )
}
