'use client'

import { useEffect, useState } from 'react'
import {
  money, num, shortDate, Banner, EmptyState, IconChevron,
} from '@/app/_metrics/dash'

/* ═══════════════════════════════════════════════════════════════════════════
   The company money model — the finance sheet, live.

   Revenue is what Commas has actually released into the bank, not what was
   charged, because that is the number the business spends. Ad spend comes
   from Meta. Everything else — refunds, referral fees, payroll, profit share,
   investments, interest — is kept in finance_entries and typed in once per
   period, as it always was.
   ═══════════════════════════════════════════════════════════════════════════ */

type Ledger = {
  source: { fetchedAt: string | null; error: string | null; transactions: number; payoutFee: number }
  totals: Record<string, number>
  entities: string[]
  periods: any[]
  payouts: { date: string; count: number; gross: number; fees: number; net: number }[]
  balances: { account: string; label: string; amount: number; asOf: string; note: string | null }[]
  setup: { entriesMissing: boolean }
}

export function MoneyModel() {
  const [data, setData] = useState<Ledger | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPayouts, setShowPayouts] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/finance/ledger')
      .then(r => r.json())
      .then(d => { if (!cancelled) { if (d.error) setError(d.error); else setData(d) } })
      .catch(() => { if (!cancelled) setError('The money model could not be loaded.') })
    return () => { cancelled = true }
  }, [])

  if (error) return <Banner tone="crit" title="Money model unavailable">{error}</Banner>
  if (!data) return <div className="mx-card" style={{ height: 210 }}><div className="mx-skel" style={{ height: '100%' }} /></div>

  const t = data.totals
  const banked = data.balances.filter(b => b.account !== 'dispute').reduce((s, b) => s + b.amount, 0)
  const dispute = data.balances.find(b => b.account === 'dispute')
  const periods = [...data.periods].reverse()
  const live = periods.filter(p => p.revenue > 0 || p.spent > 0 || p.profitShareTotal > 0)

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div className="mx-section-head">
        <div>
          <h2 className="mx-page-title" style={{ fontSize: 21 }}>Money <i>in and out</i></h2>
          <p className="mx-page-sub" style={{ marginTop: 6 }}>
            Cash actually received from Commas against everything the business paid out. Every period the
            business has traded — this section ignores the range above.
          </p>
        </div>
        <p className="mx-section-note">
          {data.source.transactions} Commas {data.source.transactions === 1 ? 'transaction' : 'transactions'}
          {data.source.fetchedAt && ` · read ${new Date(data.source.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
        </p>
      </div>

      {data.source.error && (
        <Banner tone="crit" title="Commas could not be read">{data.source.error}</Banner>
      )}
      {data.setup.entriesMissing && (
        <Banner tone="warn" title="Hand-kept lines are not in the database yet">
          Refunds, referral fees, payroll, profit share, investments, interest and the bank balances live in
          <code> finance_entries</code> / <code>finance_balances</code>. Run
          <code> supabase/migration_finance_ledger.sql</code> in the Supabase SQL editor — it creates the tables and
          seeds them from the sheet as of 09/14/2026. Until then those columns read zero.
        </Banner>
      )}

      <div>
        <div className="mx-hero">
          <Cell label="Money received" value={money(t.received)}
            foot={t.pending > 0 ? `${money(t.pending)} still to be released` : 'all payouts released'} />
          <Cell label="Money spent" value={money(t.spent)}
            foot={`${money(t.adSpend)} of it on ads`} />
          <Cell label="Profit share paid" value={money(t.profitShare)}
            foot={(() => {
              const n = data.periods.filter(p => p.profitShareTotal > 0).length
              return n ? `across ${n} ${n === 1 ? 'period' : 'periods'}` : 'no distributions recorded'
            })()} />
          <Cell label="Net position" value={money(t.netPosition)}
            tone={t.netPosition >= 0 ? 'good' : 'crit'}
            foot="received, less spend and distributions" />
          <Cell label="In the bank" value={banked > 0 ? money(banked) : '—'}
            foot={data.balances.length
              ? `as of ${shortDate(data.balances[0].asOf)}${dispute ? ` · ${money(dispute.amount)} in dispute` : ''}`
              : 'no balances on file'} />
        </div>

        <div className="mx-strip">
          <Fig label="Gross charged" value={money(t.gross)} />
          <Fig label="Processing fees" value={money(t.fees)} />
          <Fig label="Refunds" value={money(t.refunds)} tone={t.refunds > 0 ? 'var(--mx-crit)' : undefined} />
          <Fig label="Referral fees" value={money(t.referral)} />
          <Fig label="Payroll" value={money(t.payroll)} />
          <Fig label="Investments" value={money(t.investment)} />
          <Fig label="Interest earned" value={money(t.interest)} tone={t.interest > 0 ? 'var(--mx-good)' : undefined} />
        </div>
      </div>

      <div className="mx-card" style={{ overflow: 'hidden' }}>
        <div className="mx-card-head">
          <span className="mx-card-title">By pay period</span>
          <span className="mx-fin-note">Revenue counted the day Commas released it</span>
        </div>

        {live.length === 0 ? (
          <div style={{ padding: 6 }}>
            <EmptyState compact title="No money moved yet" text="No payouts, spend or distributions in these periods." />
          </div>
        ) : (
          <div className="mx-tw">
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="num">Revenue</th>
                  <th className="num">Refund</th>
                  <th className="num">Ad spend</th>
                  <th className="num">Ops</th>
                  <th className="num">Referral</th>
                  <th className="num">Payroll</th>
                  {data.entities.map(e => <th key={e} className="num">{e}</th>)}
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {live.map(p => (
                  <tr className="row" key={p.key}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{p.label}</td>
                    <td className="num" style={{ fontWeight: 650, color: p.revenue > 0 ? 'var(--mx-good)' : undefined }}>
                      {p.revenue > 0 ? money(p.revenue) : <span className="mx-dim">—</span>}
                    </td>
                    <Out v={p.refund} />
                    <Out v={p.adSpend} />
                    <Out v={p.ops} />
                    <Out v={p.referral} />
                    <Out v={p.payroll} />
                    {data.entities.map(e => <Out key={e} v={p.profitShare?.[e] || 0} />)}
                    <td className={`num ${p.netProfit >= 0 ? 'pos' : 'neg'}`}>
                      {p.netProfit < 0 ? `−${money(Math.abs(p.netProfit))}` : money(p.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="lbl">Total</td>
                  <td className="num">{money(t.received)}</td>
                  <td className="num">{money(t.refunds)}</td>
                  <td className="num">{money(t.adSpend)}</td>
                  <td className="num">{money(t.ops)}</td>
                  <td className="num">{money(t.referral)}</td>
                  <td className="num">{money(t.payroll)}</td>
                  {data.entities.map(e => (
                    <td key={e} className="num">
                      {money(data.periods.reduce((s: number, p: any) => s + (p.profitShare?.[e] || 0), 0))}
                    </td>
                  ))}
                  <td className={`num ${t.netPosition >= 0 ? 'pos' : 'neg'}`}>{money(t.netPosition)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--mx-line-2)' }}>
          <button className="mx-btn mx-btn-quiet" onClick={() => setShowPayouts(o => !o)}>
            <IconChevron style={{ transform: showPayouts ? 'rotate(90deg)' : undefined, transition: 'transform 160ms var(--mx-ease-out)' }} />
            {showPayouts ? 'Hide' : 'Show'} the {data.payouts.length} Commas payouts behind that revenue
          </button>
        </div>

        {showPayouts && (
          <div className="mx-tw" style={{ borderTop: '1px solid var(--mx-line-2)' }}>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Released</th>
                  <th className="num">Charges</th>
                  <th className="num">Gross</th>
                  <th className="num">Fees</th>
                  <th className="num">Landed</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map(p => (
                  <tr className="row" key={p.date}>
                    <td style={{ fontWeight: 600 }}>{shortDate(p.date)}</td>
                    <td className="num">{num(p.count)}</td>
                    <td className="num">{money(p.gross)}</td>
                    <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(p.fees)}</td>
                    <td className="num" style={{ fontWeight: 650 }}>{money(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.balances.length > 0 && (
        <div className="mx-strip">
          {data.balances.map(b => (
            <Fig key={b.account} label={b.label} value={money(b.amount)}
              tone={b.account === 'dispute' ? 'var(--mx-warn)' : undefined} />
          ))}
        </div>
      )}
    </section>
  )
}

function Cell({ label, value, foot, tone }: { label: string; value: string; foot: string; tone?: 'good' | 'crit' }) {
  return (
    <div className="mx-hero-cell">
      <span className="mx-hero-label">{label}</span>
      <span className={`mx-hero-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
      <span className="mx-hero-foot">{foot}</span>
    </div>
  )
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mx-strip-cell">
      <div className="mx-strip-label">{label}</div>
      <div className={`mx-strip-value ${value === '—' ? 'is-empty' : ''}`} style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  )
}

/** Money leaving the business: shown as a plain figure, dimmed when nothing moved. */
function Out({ v }: { v: number }) {
  return (
    <td className="num" style={{ color: v > 0 ? 'var(--mx-ink-2)' : undefined }}>
      {v > 0 ? money(v) : <span className="mx-dim">—</span>}
    </td>
  )
}
