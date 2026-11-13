'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usd, pct, num, tone, dayShort } from '@/app/finance/_components/fmt'
import { invoicePathSegment } from '@/app/finance/_lib/invoice-routes'
import { CaseActions } from '@/app/finance/_components/case-actions'
import { financeDay } from '@/lib/finance/clock'

/* One firm: its all-time figures, then its billing periods. Each invoice
   opens onto its own P&L. */

export default function FirmPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [book, setBook] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ code: '', revenue: '', periodStart: '', periodEnd: '', caseCount: '', title: '' })
  const [pcs, setPcs] = useState<any[]>([])

  const load = useCallback(async () => {
    const d = await fetch('/api/finance/book').then(r => r.json()).catch(() => ({ error: 'Could not load.' }))
    if (d.error) setError(d.error); else { setBook(d); setError('') }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const firm = useMemo(() => (book?.firms ?? []).find((x: any) => x.slug === slug), [book, slug])

  /* This firm's signed cases.

     The case list lives here rather than on the report: the report is read
     to find out how the month went, and this is read to fix what one case
     says — which firm took it, and whether it was swapped. Both questions
     are about a firm, so both are answered on the firm's own page. */
  const loadCases = useCallback(async (firmId: string) => {
    const d = await fetch(`/api/finance/pcs?firm=${firmId}&limit=2000`)
      .then(r => r.json()).catch(() => null)
    setPcs(d?.pcs ?? [])
  }, [])
  useEffect(() => { if (firm?.id) loadCases(firm.id) }, [firm?.id, loadCases])

  /* Everywhere a case can be sent. Every firm and every invoice, not just
     this firm's — routing a case is how a case that came in under the
     wrong firm gets to the right one. */
  const routeFirms = useMemo(
    () => (book?.firms ?? []).map((x: any) => ({ id: x.id, name: x.name })),
    [book])
  const routeInvoices = useMemo(
    () => (book?.invoices ?? []).map((i: any) => ({
      code: i.code,
      firmId: i.firmId,
      label: `${i.code} · ${dayShort(i.period.start)} – ${dayShort(i.period.end)}`,
    })),
    [book])

  const delivered = pcs.filter(p => !p.isReplacement)
  const replacements = pcs.length - delivered.length
  const invoices = useMemo(
    () => (book?.invoices ?? []).filter((i: any) => i.firmSlug === slug)
      .sort((a: any, b: any) => b.period.start.localeCompare(a.period.start)),
    [book, slug])

  async function addInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!firm) return
    setBusy(true); setErr('')
    const res = await fetch('/api/finance/invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, firmId: firm.id }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d.error || 'Could not create that invoice.'); return }
    setF({ code: '', revenue: '', periodStart: '', periodEnd: '', caseCount: '', title: '' })
    setShowAdd(false); await load()
  }

  if (loading) return <p className="fin-note">Loading…</p>
  if (error) return <p className="fin-err">{error}</p>
  if (!firm) {
    return (
      <>
        <h1 className="fin-h1">Firm not found</h1>
        <p className="fin-sub">Nothing matches “{slug}”.</p>
        <p style={{ marginTop: 14 }}><Link className="fin-btn" href="/finance/firms">Back to firms</Link></p>
      </>
    )
  }

  return (
    <>
      <div className="fin-head">
        <div>
          <p className="fin-crumb"><Link href="/finance/firms">Firms</Link></p>
          <h1 className="fin-h1">
            {firm.name}
            {firm.archived && <span className="fin-tag" style={{ marginLeft: 8 }}>archived</span>}
          </h1>
          <p className="fin-sub">
            {num(invoices.length)} billing {invoices.length === 1 ? 'period' : 'periods'}
          </p>
        </div>
        <button className="fin-btn pri" onClick={() => setShowAdd(s => !s)}>
          {showAdd ? 'Cancel' : 'Add invoice'}
        </button>
      </div>

      <div className="fin-figs">
        <div className="fin-fig">
          <span className="fin-fig-l">Revenue</span>
          <span className="fin-fig-v fin-num">{usd(firm.revenue)}</span>
          <span className="fin-fig-s">across its invoices</span>
        </div>
        <div className="fin-fig">
          <span className="fin-fig-l">Advertising</span>
          <span className="fin-fig-v fin-num">{usd(firm.adSpend)}</span>
          <span className="fin-fig-s">inside those periods</span>
        </div>
        <div className="fin-fig">
          <span className="fin-fig-l">Worker cost</span>
          <span className="fin-fig-v fin-num">{usd(firm.workerCost)}</span>
          <span className="fin-fig-s">hours and commission</span>
        </div>
        <div className="fin-fig">
          <span className="fin-fig-l">Profit</span>
          <span className={`fin-fig-v fin-num ${tone(firm.profit)}`}>{usd(firm.profit)}</span>
          <span className="fin-fig-s">revenue less both</span>
        </div>
        <div className="fin-fig">
          <span className="fin-fig-l">Margin</span>
          <span className={`fin-fig-v fin-num ${tone(firm.margin)}`}>{pct(firm.margin)}</span>
          <span className="fin-fig-s">{firm.margin == null ? 'no revenue booked' : 'of revenue'}</span>
        </div>
      </div>

      {showAdd && (
        <div className="fin-card" style={{ marginTop: 20 }}>
          <div className="fin-card-h">
            <span className="fin-card-t">New invoice</span>
            <span className="fin-card-n">Its amount is booked as revenue</span>
          </div>
          <form className="fin-form" onSubmit={addInvoice}>
            <div className="fin-row3">
              <label className="fin-field">
                <span>Code</span>
                <input className="fin-input" value={f.code} required placeholder="INV-8"
                       onChange={e => setF({ ...f, code: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>Revenue billed</span>
                <input className="fin-input fin-num" value={f.revenue} required inputMode="decimal"
                       placeholder="105000" onChange={e => setF({ ...f, revenue: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>Cases (optional)</span>
                <input className="fin-input fin-num" value={f.caseCount} inputMode="numeric"
                       placeholder="30" onChange={e => setF({ ...f, caseCount: e.target.value })} />
              </label>
            </div>
            <div className="fin-row2">
              <label className="fin-field">
                <span>Period start</span>
                <input className="fin-input" type="date" value={f.periodStart} required
                       onChange={e => setF({ ...f, periodStart: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>Period end</span>
                <input className="fin-input" type="date" value={f.periodEnd} required
                       onChange={e => setF({ ...f, periodEnd: e.target.value })} />
              </label>
            </div>
            <p className="fin-note">
              Advertising and rep pay inside this period are charged to it automatically.
            </p>
            {err && <p className="fin-err">{err}</p>}
            <div><button className="fin-btn pri" disabled={busy}>
              {busy ? 'Creating…' : 'Create invoice'}</button></div>
          </form>
        </div>
      )}

      <section className="fin-sec">
        <h2 className="fin-sec-h">Billing periods</h2>
        {invoices.length === 0 ? (
          <div className="fin-card"><p className="fin-empty">
            No invoices yet. An invoice is a billing window — create one and every figure
            on this page can be sliced to it.
          </p></div>
        ) : (
          <div className="fin-grid">
            {invoices.map((inv: any) => (
              <Link key={inv.id} className="fin-tile"
                    href={`/finance/firms/${slug}/invoice/${invoicePathSegment(inv.code)}`}>
                <div className="fin-tile-h">
                  <span className="fin-inv-code">{inv.code}</span>
                  <span className="fin-tile-arrow" aria-hidden="true">→</span>
                </div>
                <div className="fin-tile-name" style={{ marginBottom: 4 }}>
                  {inv.title || inv.code}
                </div>
                <div className="fin-note fin-num" style={{ marginBottom: 12 }}>
                  {dayShort(inv.period.start)} – {dayShort(inv.period.end)}
                </div>
                <div className="fin-tile-figs">
                  <div>
                    <span className="fin-fig-l">Revenue</span>
                    <span className="fin-tile-v fin-num">{usd(inv.revenue)}</span>
                  </div>
                  <div>
                    <span className="fin-fig-l">Ads</span>
                    <span className="fin-tile-v fin-num">{usd(inv.adSpend)}</span>
                  </div>
                  <div>
                    <span className="fin-fig-l">Margin</span>
                    <span className={`fin-tile-v fin-num ${tone(inv.margin)}`}>{pct(inv.margin, 0)}</span>
                  </div>
                </div>
                <div className="fin-tile-foot">
                  <span>{inv.caseCount != null ? `${num(inv.caseCount)} cases billed` : 'cases not set'}</span>
                  <span className={tone(inv.profit)}>{usd(inv.profit)} profit</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Signed cases. Every one this firm has, newest first — the list the
          invoice figures are made of, and the only place a case can be put
          back or sent to the firm that actually took it. */}
      <section className="fin-sec">
        <h2 className="fin-sec-h">Signed cases</h2>
        <div className="fin-card">
          <div className="fin-card-h">
            <span className="fin-card-t">
              {num(delivered.length)} case{delivered.length === 1 ? '' : 's'} delivered
            </span>
            <span className="fin-card-n">
              {replacements > 0
                ? `${num(replacements)} replacement${replacements === 1 ? '' : 's'}, which count for nothing`
                : 'no replacements'}
            </span>
          </div>
          {pcs.length === 0 ? (
            <p className="fin-empty">No case has signed for this firm.</p>
          ) : (
            <div className="fin-scroll">
              <table className="fin-table">
                <thead><tr>
                  <th>Signed</th><th>Case</th><th>Closed by</th><th>Invoice</th>
                  <th className="n">Change</th>
                </tr></thead>
                <tbody>
                  {pcs.slice(0, 500).map((p: any) => (
                    <tr key={p.id}>
                      {/* The Pacific day it signed — the day the book
                          tracks it to, not the UTC day it was written. */}
                      <td className="fin-num">{dayShort(financeDay(p.signedAt))}</td>
                      <td>
                        {p.name}
                        {p.isReplacement && <span className="fin-tag warn" style={{ marginLeft: 6 }}>replacement</span>}
                      </td>
                      <td>{p.closer ?? '—'}</td>
                      <td>{p.invoiceCode ?? '—'}</td>
                      <td className="n">
                        <CaseActions
                          id={p.id}
                          name={p.name}
                          firmId={p.firmId}
                          invoiceCode={p.invoiceCode}
                          isReplacement={p.isReplacement}
                          firms={routeFirms}
                          invoices={routeInvoices}
                          /* Both the list and the figures above it move
                             when a case changes, so both are reloaded. */
                          onChanged={() => { load(); if (firm?.id) loadCases(firm.id) }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pcs.length > 500 && (
            <p className="fin-note" style={{ padding: '0 16px 12px' }}>
              Showing the 500 most recent of {num(pcs.length)}.
            </p>
          )}
        </div>
      </section>
    </>
  )
}
