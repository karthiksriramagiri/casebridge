'use client'

import { useCallback, useEffect, useState } from 'react'
import { usd, num, pct } from '../_components/fmt'

/* Rep pay — read from the Team Center, not kept here.

   Nothing on this page is typed in. Hours come off the clock, rates from each
   rep's pay rate, commission from the cases they closed. It is the same
   arithmetic the rep sees on their own pay page, which is the point: the
   worker-cost half of the margin and the cheque someone is written have to be
   the same number, and they can only be the same number if they are the same
   calculation reading the same rows. */

const MONTHS = 6

function monthOptions() {
  const out: { value: string; label: string }[] = [{ value: '', label: 'All time' }]
  const now = new Date()
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push({
      value: d.toISOString().slice(0, 7),
      label: d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    })
  }
  return out
}

export default function PayrollPage() {
  const [reps, setReps] = useState<any[]>([])
  const [totals, setTotals] = useState<any>(null)
  const [repaired, setRepaired] = useState<{ leftOpen: number; closedLate: number } | null>(null)
  const [rateGap, setRateGap] = useState<{ count: number; rate: number } | null>(null)
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (m: string) => {
    setLoading(true)
    let qs = ''
    if (m) {
      const start = `${m}-01`
      const d = new Date(`${m}-01T00:00:00Z`)
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      const end = new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10)
      qs = `?from=${start}&to=${end}`
    }
    const d = await fetch(`/api/finance/salaries${qs}`).then(r => r.json()).catch(() => ({ error: 'Could not load rep pay.' }))
    if (d.error) { setError(d.error); setReps([]); setTotals(null) }
    else { setError(''); setReps(d.reps ?? []); setTotals(d.totals ?? null); setRepaired(d.repairedShifts ?? null)
      setRateGap(d.onDefaultRate ? { count: d.onDefaultRate, rate: d.defaultHourlyRate } : null) }
    setLoading(false)
  }, [])

  useEffect(() => { load(month) }, [load, month])

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Rep pay</h1>
          <p className="fin-sub">Hours, rates and commission from the Team Center</p>
        </div>
        <label className="fin-field" style={{ minWidth: 180 }}>
          <span>Period</span>
          <select className="fin-input" value={month} onChange={e => setMonth(e.target.value)}>
            {monthOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="fin-err">{error}</p>}

      {rateGap && (
        <div className="fin-warn" style={{ marginBottom: 12 }}>
          {rateGap.count} rep{rateGap.count === 1 ? ' has' : 's have'} no hourly rate on file, so
          their hours are priced at the ${rateGap.rate} fallback. Set real rates in
          <code> worker_pay_rates </code> and every figure here — and the margin — moves with them.
        </div>
      )}

      {repaired && (repaired.leftOpen > 0 || repaired.closedLate > 0) && (
        <div className="fin-warn" style={{ marginBottom: 18 }}>
          {repaired.leftOpen > 0 && <>{repaired.leftOpen} shift{repaired.leftOpen === 1 ? '' : 's'} never clocked out</>}
          {repaired.leftOpen > 0 && repaired.closedLate > 0 && ', and '}
          {repaired.closedLate > 0 && <>{repaired.closedLate} clocked out more than 16 hours late</>}
          {' '}— each counted as one full shift so it cannot keep billing overtime.
          Fixing them in the Team Center will make these figures exact.
        </div>
      )}
      {loading ? <p className="fin-note">Loading…</p> : (
        <>
          <div className="fin-figs">
            <div className="fin-fig">
              <span className="fin-fig-l">Worker cost</span>
              <span className="fin-fig-v fin-num">{usd(totals?.total)}</span>
              <span className="fin-fig-s">hours and commission</span>
            </div>
            <div className="fin-fig">
              <span className="fin-fig-l">Hours pay</span>
              <span className="fin-fig-v fin-num">{usd(totals?.basePay)}</span>
              <span className="fin-fig-s">{num(totals?.hours)} hours on the clock</span>
            </div>
            <div className="fin-fig">
              <span className="fin-fig-l">Commission</span>
              <span className="fin-fig-v fin-num">{usd(totals?.commission)}</span>
              <span className="fin-fig-s">
                {num(totals?.closes)} closes{totals?.otCloses ? `, ${num(totals.otCloses)} on overtime` : ''}
              </span>
            </div>
            <div className="fin-fig">
              <span className="fin-fig-l">Reps</span>
              <span className="fin-fig-v fin-num">{num(reps.length)}</span>
              <span className="fin-fig-s">paid in this period</span>
            </div>
          </div>

          <section className="fin-sec">
            <h2 className="fin-sec-h">By rep</h2>
            <div className="fin-card fin-scroll">
              <table className="fin-table">
                <thead><tr>
                  <th>Rep</th><th className="n">Rate</th><th className="n">Hours</th>
                  <th className="n">Overtime</th><th className="n">Hours pay</th>
                  <th className="n">Closes</th><th className="n">Commission</th><th className="n">Total</th>
                </tr></thead>
                <tbody>
                  {reps.map(r => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="n fin-num">
                        {usd(r.hourlyRate)}/hr
                        {r.regularHours + r.overtimeHours > 0 && !r.rateOnFile &&
                          <span className="fin-tag warn" style={{ marginLeft: 6 }}>default</span>}
                      </td>
                      <td className="n fin-num">{num(r.regularHours)}</td>
                      <td className="n fin-num">{r.overtimeHours ? num(r.overtimeHours) : '—'}</td>
                      <td className="n fin-num">{usd(r.basePay)}</td>
                      <td className="n fin-num">
                        {num(r.closes)}{r.otCloses ? <span className="fin-tag warn" style={{ marginLeft: 6 }}>{r.otCloses} OT</span> : null}
                      </td>
                      <td className="n fin-num">{usd(r.commission)}</td>
                      <td className="n fin-num">{usd(r.total)}</td>
                    </tr>
                  ))}
                  {reps.length === 0 && (
                    <tr><td colSpan={8} className="fin-empty">
                      Nobody clocked in or closed a case in this period.
                    </td></tr>
                  )}
                </tbody>
                {reps.length > 0 && totals && (
                  <tfoot className="fin-tfoot"><tr>
                    <td>All reps</td>
                    <td className="n" />
                    <td className="n fin-num">{num(totals.hours)}</td>
                    <td className="n" />
                    <td className="n fin-num">{usd(totals.basePay)}</td>
                    <td className="n fin-num">{num(totals.closes)}</td>
                    <td className="n fin-num">{usd(totals.commission)}</td>
                    <td className="n fin-num">{usd(totals.total)}</td>
                  </tr></tfoot>
                )}
              </table>
            </div>
          </section>

          <p className="fin-note" style={{ marginTop: 14 }}>
            A close pays its tier rate — $30 for the first fifteen in a month, $40 to
            twenty-five, $50 past that — unless it is marked an overtime close, which
            pays a flat $50. Mark one on the invoice it sits on.
            {totals?.commission > 0 && totals?.total > 0 && (
              <> Commission is {pct((totals.commission / totals.total) * 100, 0)} of what the reps cost.</>
            )}
          </p>
        </>
      )}
    </>
  )
}
