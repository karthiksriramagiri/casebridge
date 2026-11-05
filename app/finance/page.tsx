'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usd, pct, num, tone, dayShort } from './_components/fmt'
import { invoicePathSegment } from './_lib/invoice-routes'
import {
  RANGE_KEYS, RANGE_LABEL, rangeFor, rangeQuery, type Range, type RangeKey,
} from './_lib/ranges'

/* The dashboard. Everything here comes from /api/finance/book, which is also
   what the firms tab and every invoice page read — so the figures cannot
   disagree with each other. */

type Book = {
  company: {
    revenue: number; adSpend: number; workerCost: number; cost: number
    profit: number; margin: number | null
    invoiceCount: number; firmCount: number
    workerCostTotal: number; unallocatedWorkerCost: number
    basePay: number; commission: number
    adSpendTotal: number; unallocatedAdSpend: number; sharedAdAccounts: number
  }
  firms: any[]
  invoices: any[]
  window: { start: string; end: string } | null
  setup: { invoicesNeedRevenueColumn: boolean; teamDataAvailable: boolean; metaAccounts: number }
}

export default function Dashboard() {
  const [book, setBook] = useState<Book | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  /* The window only shapes this page. Firms, invoices and rep pay keep their
     whole history, so drilling into a firm never hides part of it. */
  const [rangeKey, setRangeKey] = useState<RangeKey>('all')
  const [custom, setCustom] = useState({ from: '', to: '' })

  /* The window lives in the URL, so a reload keeps it and a link can point at
     a particular stretch of the book. Written as a hash: it needs no round
     trip and no Suspense boundary. */
  useEffect(() => {
    const read = () => {
      const h = location.hash.slice(1)
      if (!h) return
      const [key, from, to] = h.split('|')
      if ((RANGE_KEYS as readonly string[]).includes(key)) setRangeKey(key as RangeKey)
      if (key === 'custom' && from && to) setCustom({ from, to })
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  useEffect(() => {
    const h = rangeKey === 'all'
      ? ''
      : rangeKey === 'custom'
        ? (custom.from && custom.to ? `#custom|${custom.from}|${custom.to}` : '#custom')
        : `#${rangeKey}`
    history.replaceState(null, '', h || location.pathname)
  }, [rangeKey, custom.from, custom.to])

  const range: Range = rangeKey === 'custom'
    ? (custom.from && custom.to ? { from: custom.from, to: custom.to } : null)
    : rangeFor(rangeKey)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/finance/book${rangeQuery(range)}`).then(r => r.json()).then(d => {
      if (d.error) setError(d.error); else { setError(''); setBook(d) }
    }).catch(() => setError('Could not load the book.'))
      .finally(() => setLoading(false))
  }, [range?.from, range?.to])

  const picker = (
    <div className="fin-range">
      <select className="fin-input" value={rangeKey}
              onChange={e => setRangeKey(e.target.value as RangeKey)}>
        {RANGE_KEYS.map(k => <option key={k} value={k}>{RANGE_LABEL[k]}</option>)}
      </select>
      {rangeKey === 'custom' && (
        <>
          <input className="fin-input" type="date" value={custom.from} aria-label="From"
                 onChange={e => setCustom({ ...custom, from: e.target.value })} />
          <span className="fin-range-to">to</span>
          <input className="fin-input" type="date" value={custom.to} aria-label="To"
                 onChange={e => setCustom({ ...custom, to: e.target.value })} />
        </>
      )}
    </div>
  )

  if (loading || error || !book) {
    return (
      <>
        <div className="fin-head">
          <div><h1 className="fin-h1">Dashboard</h1></div>
          {picker}
        </div>
        {error ? <p className="fin-err">{error}</p> : <p className="fin-note">Loading…</p>}
      </>
    )
  }

  const c = book.company
  const needsSetup = book.setup.invoicesNeedRevenueColumn || !book.setup.teamDataAvailable
  const recent = [...book.invoices].slice(0, 8)
  const ranked = [...book.firms].filter(f => f.revenue > 0 || f.adSpend > 0)
    .sort((a, b) => b.revenue - a.revenue)

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Dashboard</h1>
          <p className="fin-sub">
            {num(c.invoiceCount)} invoice{c.invoiceCount === 1 ? '' : 's'} across {num(c.firmCount)} active firms
            {book.window && <> · {dayShort(book.window.start)} – {dayShort(book.window.end)}</>}
          </p>
        </div>
        {picker}
      </div>

      {book.window && c.invoiceCount > 0 && (
        <p className="fin-note" style={{ margin: '-8px 0 16px' }}>
          An invoice only partly inside this window counts the share of its revenue
          that matches the share of its days, so revenue and costs are cut on the
          same line.
        </p>
      )}

      {needsSetup && (
        <div className="fin-warn" style={{ marginBottom: 18 }}>
          {book.setup.invoicesNeedRevenueColumn && (
            <>Invoices cannot hold revenue yet — run <code>supabase/migration_finance_rebuild.sql</code>. </>
          )}
          {!book.setup.teamDataAvailable && (
            <>Team Center hours or cases could not be read, so worker cost is missing from the margin.</>
          )}
        </div>
      )}

      <div className="fin-figs">
        <div className="fin-fig">
          <span className="fin-fig-l">Revenue</span>
          <span className="fin-fig-v fin-num">{usd(c.revenue)}</span>
          <span className="fin-fig-s">
            billed across {num(c.invoiceCount)} invoice{c.invoiceCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="fin-fig">
          <span className="fin-fig-l">Advertising</span>
          <span className="fin-fig-v fin-num">{usd(c.adSpend)}</span>
          <span className="fin-fig-s">inside invoice periods</span>
        </div>
        <div className="fin-fig">
          <span className="fin-fig-l">Worker cost</span>
          <span className="fin-fig-v fin-num">{usd(c.workerCost)}</span>
          <span className="fin-fig-s">
            {usd(c.basePay)} hours · {usd(c.commission)} commission
          </span>
        </div>
        <div className="fin-fig">
          <span className="fin-fig-l">Profit</span>
          <span className={`fin-fig-v fin-num ${tone(c.profit)}`}>{usd(c.profit)}</span>
          <span className="fin-fig-s">revenue less both costs</span>
        </div>
        <div className="fin-fig">
          <span className="fin-fig-l">Margin</span>
          <span className={`fin-fig-v fin-num ${tone(c.margin)}`}>{pct(c.margin)}</span>
          <span className="fin-fig-s">{c.margin == null ? 'no revenue booked' : 'of revenue'}</span>
        </div>
      </div>

      <div className="fin-eq fin-num">
        <b>{usd(c.revenue)}</b>
        <span className="op">−</span><b>{usd(c.adSpend)}</b><span className="op">ads</span>
        <span className="op">−</span><b>{usd(c.workerCost)}</b><span className="op">workers</span>
        <span className="op">=</span>
        <span className={`res ${tone(c.profit)}`}>{usd(c.profit)} · {pct(c.margin)}</span>
      </div>

      {/* What the margin deliberately leaves out, and what could not be placed. */}
      {(c.unallocatedAdSpend > 0 || c.unallocatedWorkerCost > 0) && (
        <p className="fin-note" style={{ marginTop: 10 }}>
          {c.unallocatedAdSpend > 0 && (
            <>{usd(c.unallocatedAdSpend)} of advertising fell on days no invoice covers
              {c.unallocatedWorkerCost > 0 ? ', and ' : '. '}</>
          )}
          {c.unallocatedWorkerCost > 0 && (
            <>{usd(c.unallocatedWorkerCost)} of rep pay fell on days no invoice covers. </>
          )}
          {c.unallocatedAdSpend > 0 && c.unallocatedWorkerCost > 0
            ? 'Neither is in the figures above.'
            : 'That is not in the figures above.'}
          {c.sharedAdAccounts > 0 && ' One ad account bills more than one firm, so its spend is split by invoice day.'}
        </p>
      )}

      <section className="fin-sec">
        <h2 className="fin-sec-h">By firm</h2>
        <div className="fin-card fin-scroll">
          <table className="fin-table">
            <thead><tr>
              <th>Firm</th><th className="n">Invoices</th><th className="n">Revenue</th>
              <th className="n">Advertising</th><th className="n">Workers</th>
              <th className="n">Profit</th><th className="n">Margin</th>
            </tr></thead>
            <tbody>
              {ranked.map(f => (
                <tr key={f.id}>
                  <td>
                    <Link href={`/finance/firms/${f.slug}`}>{f.name}</Link>
                    {f.archived && <span className="fin-tag" style={{ marginLeft: 6 }}>archived</span>}
                  </td>
                  <td className="n fin-num">{num(f.invoiceCount)}</td>
                  <td className="n fin-num">{usd(f.revenue)}</td>
                  <td className="n fin-num">{usd(f.adSpend)}</td>
                  <td className="n fin-num">{usd(f.workerCost)}</td>
                  <td className={`n fin-num ${tone(f.profit)}`}>{usd(f.profit)}</td>
                  <td className={`n fin-num ${tone(f.margin)}`}>{pct(f.margin, 0)}</td>
                </tr>
              ))}
              {ranked.length === 0 && (
                <tr><td colSpan={7} className="fin-empty">
                  {book.window
                    ? 'No firm has revenue or spend inside this window.'
                    : 'No firm has revenue or spend yet. Add an invoice to start.'}
                </td></tr>
              )}
            </tbody>
            {ranked.length > 0 && (
              <tfoot className="fin-tfoot"><tr>
                <td>All firms</td>
                <td className="n fin-num">{num(c.invoiceCount)}</td>
                <td className="n fin-num">{usd(c.revenue)}</td>
                <td className="n fin-num">{usd(c.adSpend)}</td>
                <td className="n fin-num">{usd(c.workerCost)}</td>
                <td className={`n fin-num ${tone(c.profit)}`}>{usd(c.profit)}</td>
                <td className={`n fin-num ${tone(c.margin)}`}>{pct(c.margin, 0)}</td>
              </tr></tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="fin-sec">
        <h2 className="fin-sec-h">Latest invoices</h2>
        <div className="fin-card fin-scroll">
          <table className="fin-table">
            <thead><tr>
              <th>Invoice</th><th>Firm</th><th>Period</th>
              <th className="n">Revenue</th><th className="n">Advertising</th>
              <th className="n">Workers</th><th className="n">Margin</th>
            </tr></thead>
            <tbody>
              {recent.map(i => (
                <tr key={i.id}>
                  <td><Link href={`/finance/firms/${i.firmSlug}/invoice/${invoicePathSegment(i.code)}`}>{i.code}</Link></td>
                  <td>{i.firmName}</td>
                  <td className="fin-num">{dayShort(i.period.start)} – {dayShort(i.period.end)}</td>
                  <td className="n fin-num">{usd(i.revenue)}</td>
                  <td className="n fin-num">{usd(i.adSpend)}</td>
                  <td className="n fin-num">{usd(i.workerCost)}</td>
                  <td className={`n fin-num ${tone(i.margin)}`}>{pct(i.margin, 0)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={7} className="fin-empty">
                  {book.window ? 'No invoices overlap this window.' : 'No invoices yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
