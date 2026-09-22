'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment } from '@/app/finance/firms/_lib/invoice-routes'
import {
  Leaderboard, EmptyState, Banner, DashboardSkeleton, money,
} from '@/app/_metrics/dash'

export default function InvoiceTeam() {
  const params = useParams()
  const slug = params.slug as string
  const code = invoiceCodeFromRouteSegment(params.invoice as string)

  const [kpi, setKpi] = useState<any>(null)
  const [reps, setReps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showIdle, setShowIdle] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(code)}`).then(r => r.json()),
      fetch('/api/teams/admin/reps').then(r => r.json()).catch(() => ({ reps: [] })),
    ]).then(([kpiData, repData]) => {
      setKpi(kpiData)
      // The rep list carries duplicates and blank rows; collapse on name.
      const seen = new Set<string>()
      setReps((repData.reps || [])
        .filter((p: any) => (p.name || '').trim() !== '')
        .filter((p: any) => {
          const k = (p.name || '').trim().toLowerCase()
          if (seen.has(k)) return false
          seen.add(k); return true
        }))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [slug, code])

  const pcs: any[] = kpi?.pcs || []
  const replacementDays = kpi?.firm?.replacement_window_days ?? 14

  const workers = useMemo(() => {
    const byName: Record<string, { signed: number; closed: number; ot: number; second: number }> = {}
    const now = Date.now()

    for (const pc of pcs) {
      const primary = pc.workerName
      if (primary) {
        const w = (byName[primary] ||= { signed: 0, closed: 0, ot: 0, second: 0 })
        w.signed += 1
        if (pc.isOtClose) w.ot += 1
        if ((pc.caseStatus || '').toLowerCase() === 'closed') {
          w.closed += 1
        } else if (pc.qualifiedAt) {
          const end = new Date(pc.qualifiedAt)
          end.setUTCDate(end.getUTCDate() + replacementDays)
          if (end.getTime() < now) w.closed += 1
        }
      }
      // A second rep on a case splits the close credit, so it is tracked
      // separately rather than being folded into the signed count.
      const second = pc.secondWorkerName || pc.secondCloser
      if (second) {
        const w = (byName[second] ||= { signed: 0, closed: 0, ot: 0, second: 0 })
        w.second += 1
      }
    }

    const known = new Set(Object.keys(byName).map(n => n.toLowerCase()))
    const rows = Object.entries(byName).map(([name, w]) => ({ name, ...w }))

    // Reps on the roster with nothing on this invoice still belong in the list —
    // a zero is information, not an absence.
    for (const p of reps) {
      const name = (p.name || '').trim()
      if (!known.has(name.toLowerCase())) rows.push({ name, signed: 0, closed: 0, ot: 0, second: 0 })
    }

    return rows.sort((a, b) => b.signed - a.signed || b.closed - a.closed || a.name.localeCompare(b.name))
  }, [pcs, reps, replacementDays])

  if (loading) return <DashboardSkeleton />
  if (kpi?.error) return <Banner tone="crit" title="This invoice could not be loaded">{kpi.error}</Banner>

  const active = workers.filter(w => w.signed > 0 || w.second > 0)
  const idle = workers.filter(w => w.signed === 0 && w.second === 0)
  const shown = showIdle ? workers : active

  const totalSigned = workers.reduce((t, w) => t + w.signed, 0)
  const totalClosed = workers.reduce((t, w) => t + w.closed, 0)
  const totalOt = workers.reduce((t, w) => t + w.ot, 0)
  const unassigned = pcs.filter(p => !p.workerName).length
  const closeRate = totalSigned > 0 ? (totalClosed / totalSigned) * 100 : null

  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <section>
        <div className="mx-section-head">
          <div>
            <h1 className="mx-page-title" style={{ fontSize: 28 }}>Team on <i>{code}</i></h1>
            <p className="mx-page-sub">
              Who signed and closed the cases in this invoice window. A case counts as closed once
              it is marked closed, or once its {replacementDays}-day replacement window elapses.
            </p>
          </div>
        </div>

        <div className="mx-hero">
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Reps with cases</span>
            <span className={`mx-hero-value ${active.length ? '' : 'is-empty'}`}>{active.length}</span>
            <span className="mx-hero-foot">of {workers.length} on the roster</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Signed</span>
            <span className={`mx-hero-value ${totalSigned ? '' : 'is-empty'}`}>{totalSigned}</span>
            <span className="mx-hero-foot">
              {unassigned > 0 ? `${unassigned} more not assigned to a rep` : 'every case has a rep'}
            </span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Closed</span>
            <span className={`mx-hero-value ${totalClosed ? 'is-good' : 'is-empty'}`}>{totalClosed}</span>
            <span className="mx-hero-foot">past the replacement window or marked closed</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Close rate</span>
            <span className={`mx-hero-value ${closeRate == null ? 'is-empty' : closeRate >= 70 ? 'is-good' : closeRate >= 40 ? 'is-warn' : 'is-crit'}`}>
              {closeRate == null ? '—' : `${closeRate.toFixed(0)}%`}
            </span>
            <span className="mx-hero-foot">across the whole invoice</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Overtime closes</span>
            <span className={`mx-hero-value ${totalOt ? 'is-warn' : 'is-empty'}`}>{totalOt}</span>
            <span className="mx-hero-foot">{money(totalOt * 50)} in OT commission</span>
          </div>
        </div>
      </section>

      {active.length > 0 && (
        <section>
          <div className="mx-section-head">
            <p className="mx-eyebrow">Signed, by rep</p>
          </div>
          <div className="mx-card" style={{ overflow: 'hidden' }}>
            <Leaderboard
              rows={active.map(w => ({
                name: w.name,
                value: w.signed,
                sub: w.closed > 0 ? `${w.closed} closed` : undefined,
              })).filter(r => r.value > 0)}
              unit="signed"
            />
          </div>
        </section>
      )}

      <section>
        <div className="mx-section-head">
          <p className="mx-eyebrow">Everyone</p>
          {idle.length > 0 && (
            <button className="mx-btn mx-btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setShowIdle(v => !v)}>
              {showIdle ? 'Hide' : 'Show'} {idle.length} with nothing on this invoice
            </button>
          )}
        </div>

        <div className="mx-card" style={{ overflow: 'hidden' }}>
          {shown.length === 0 ? (
            <EmptyState
              title="No rep has cases on this invoice"
              text="Assign a closer from the Signed cases tab and the credit will appear here."
            />
          ) : (
            <div className="mx-tw">
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th className="num">Signed</th>
                    <th className="num">Closed</th>
                    <th className="num">Close rate</th>
                    <th className="num">OT closes</th>
                    <th className="num">2nd rep on</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(w => {
                    const rate = w.signed > 0 ? (w.closed / w.signed) * 100 : null
                    const quiet = w.signed === 0 && w.second === 0
                    return (
                      <tr className="row" key={w.name}>
                        <td>
                          <span style={{ fontWeight: 600, color: quiet ? 'var(--mx-muted)' : 'var(--mx-ink)' }}>{w.name}</span>
                          {quiet && <span className="mx-chip" style={{ marginLeft: 8, fontSize: 10 }}>no cases</span>}
                        </td>
                        <td className="num" style={{ fontWeight: 650 }}>{w.signed || <span className="mx-dim">—</span>}</td>
                        <td className="num" style={{ fontWeight: 650, color: w.closed ? 'var(--mx-good)' : undefined }}>
                          {w.closed || <span className="mx-dim">—</span>}
                        </td>
                        <td className="num" style={{ color: 'var(--mx-muted)' }}>
                          {rate == null ? <span className="mx-dim">—</span> : `${rate.toFixed(0)}%`}
                        </td>
                        <td className="num" style={{ color: w.ot ? 'var(--mx-warn)' : undefined, fontWeight: w.ot ? 650 : 400 }}>
                          {w.ot || <span className="mx-dim">—</span>}
                        </td>
                        <td className="num" style={{ color: 'var(--mx-muted)' }}>
                          {w.second || <span className="mx-dim">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="lbl">Total</td>
                    <td className="num">{totalSigned}</td>
                    <td className="num">{totalClosed}</td>
                    <td className="num">{closeRate == null ? '—' : `${closeRate.toFixed(0)}%`}</td>
                    <td className="num">{totalOt || '—'}</td>
                    <td className="num">{workers.reduce((t, w) => t + w.second, 0) || '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {unassigned > 0 && (
          <div style={{ marginTop: 10 }}>
            <Banner tone="warn" title={`${unassigned} signed ${unassigned === 1 ? 'case has' : 'cases have'} no rep`}>
              Commission cannot be calculated for them. Assign a closer from the Signed cases tab.
            </Banner>
          </div>
        )}
      </section>
    </div>
  )
}
