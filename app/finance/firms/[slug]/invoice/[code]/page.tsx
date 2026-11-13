'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usd, pct, num, tone, day, dayShort } from '@/app/finance/_components/fmt'
import { segmentMatchesCode } from '@/app/finance/_lib/invoice-routes'
import { financeDay } from '@/lib/finance/clock'
import { CaseActions } from '@/app/finance/_components/case-actions'

/* One invoice, with its own P&L and its own case list.

   The same book the dashboard reads, filtered to this invoice — so an invoice
   page and the company total can never tell different stories about the same
   money. Advertising is the firm's spend on the days this period covers; rep
   pay is this invoice's share of the hours worked in it, plus the commission
   on the cases below.

   Which is why the cases live here rather than on a tab of their own: a close
   marked overtime is worth $50 instead of its tier rate, so the list is part
   of the invoice's cost, not a separate report that happens to sit nearby. */

type Tab = 'overview' | 'cases'

export default function InvoicePage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = use(params)
  const decoded = decodeURIComponent(code)

  const [book, setBook] = useState<any>(null)
  const [pcs, setPcs] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTabState] = useState<Tab>('overview')
  const [savingOt, setSavingOt] = useState<string | null>(null)
  const [form, setForm] = useState({ revenue: '', periodStart: '', periodEnd: '', caseCount: '' })

  /* The tab lives in the URL, so a link can point straight at the case list
     and the back button steps between the two views. A hash rather than a
     query string: it costs no round trip and needs no Suspense boundary. */
  useEffect(() => {
    const read = () => setTabState(location.hash === '#cases' ? 'cases' : 'overview')
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const setTab = (t: Tab) => {
    setTabState(t)
    history.replaceState(null, '', t === 'cases' ? '#cases' : location.pathname)
  }

  useEffect(() => {
    fetch('/api/finance/book').then(r => r.json()).then(d => {
      if (d.error) { setError(d.error); return }
      setBook(d)
      const inv = (d.invoices ?? []).find((i: any) =>
        i.firmSlug === slug && segmentMatchesCode(code, i.code))
      if (inv) {
        setForm({
          revenue: String(inv.revenue || ''),
          periodStart: inv.period.start, periodEnd: inv.period.end,
          caseCount: inv.caseCount == null ? '' : String(inv.caseCount),
        })
      }
    }).catch(() => setError('Could not load the book.'))
      .finally(() => setLoading(false))
  }, [slug, decoded])

  const invoice = useMemo(
    () => (book?.invoices ?? []).find((i: any) =>
      i.firmSlug === slug && segmentMatchesCode(code, i.code)),
    [book, slug, code])

  const loadCases = useCallback(async () => {
    if (!invoice) return
    const d = await fetch(`/api/finance/pcs?firm=${invoice.firmId}&limit=2000`)
      .then(r => r.json()).catch(() => null)
    setPcs((d?.pcs ?? []).filter((p: any) =>
      // Cases this invoice covers: either stamped with its code, or signed
      // inside its period when nothing stamped them.
      p.invoiceCode === invoice.code ||
      (!p.invoiceCode && p.signedAt &&
        // The Pacific day it signed, the same day the report tracks it to.
        financeDay(p.signedAt) >= invoice.period.start &&
        financeDay(p.signedAt) <= invoice.period.end)))
  }, [invoice])
  useEffect(() => { loadCases() }, [loadCases])

  /* Everywhere a case can be sent. Every firm and every invoice, because a
     case routed off this invoice is usually one that belongs to another
     firm entirely — which is the whole reason to move it. */
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

  /* A case that changes changes the invoice it sits on: a replacement stops
     delivering, a routed case leaves this invoice entirely. Both lists are
     read again rather than patched in place, because which cases this
     invoice covers is the server's answer, not one the browser can guess. */
  const caseChanged = useCallback(async () => {
    const fresh = await fetch('/api/finance/book').then(r => r.json()).catch(() => null)
    if (fresh && !fresh.error) setBook(fresh)
    await loadCases()
  }, [loadCases])

  async function save() {
    if (!invoice) return
    setBusy(true)
    const res = await fetch('/api/finance/invoices', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: invoice.id, ...form }),
    })
    setBusy(false)
    if (res.ok) { setEditing(false); location.reload() }
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'Could not save.') }
  }

  /* Toggling overtime changes what the case costs, so the figures above are
     stale the moment it lands. The row moves first and the book is refetched
     after — a toggle that waited on both round trips would feel broken. */
  async function toggleOt(p: any) {
    const next = !p.otClose
    setSavingOt(p.id)
    setPcs(prev => prev.map(x => (x.id === p.id ? { ...x, otClose: next } : x)))
    const res = await fetch('/api/finance/pcs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, otClose: next }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Could not change that close.')
      setPcs(prev => prev.map(x => (x.id === p.id ? { ...x, otClose: p.otClose } : x)))
      setSavingOt(null)
      return
    }
    setError('')
    const fresh = await fetch('/api/finance/book').then(r => r.json()).catch(() => null)
    if (fresh && !fresh.error) setBook(fresh)
    setSavingOt(null)
  }

  if (loading) return <p className="fin-note">Loading…</p>
  if (error && !invoice) return <p className="fin-err">{error}</p>
  if (!invoice) {
    return (
      <>
        <h1 className="fin-h1">Invoice not found</h1>
        <p className="fin-sub">Nothing matches {decoded} for that firm.</p>
        <p style={{ marginTop: 14 }}>
          <Link className="fin-btn" href={`/finance/firms/${slug}`}>Back to the firm</Link>
        </p>
      </>
    )
  }

  const replacements = pcs.filter(p => p.isReplacement).length
  const originals = pcs.length - replacements
  const perCase = originals > 0 ? invoice.revenue / originals : null
  const cac = originals > 0 ? invoice.adSpend / originals : null
  const otCount = pcs.filter(p => p.otClose).length

  return (
    <>
      <div className="fin-head">
        <div>
          <p className="fin-crumb">
            <Link href="/finance/firms">Firms</Link>
            {' / '}
            <Link href={`/finance/firms/${slug}`}>{invoice.firmName}</Link>
          </p>
          <h1 className="fin-h1">{invoice.code}</h1>
          <p className="fin-sub fin-num">
            {day(invoice.period.start)} – {day(invoice.period.end)} · {num(invoice.days)} days
          </p>
        </div>
        <button className="fin-btn" onClick={() => setEditing(e => !e)}>
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {error && <p className="fin-err" style={{ marginBottom: 14 }}>{error}</p>}

      {editing && (
        <div className="fin-card" style={{ marginBottom: 20 }}>
          <div className="fin-form">
            <div className="fin-row3">
              <label className="fin-field">
                <span>Revenue billed</span>
                <input className="fin-input fin-num" value={form.revenue}
                       onChange={e => setForm({ ...form, revenue: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>Period start</span>
                <input className="fin-input" type="date" value={form.periodStart}
                       onChange={e => setForm({ ...form, periodStart: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>Period end</span>
                <input className="fin-input" type="date" value={form.periodEnd}
                       onChange={e => setForm({ ...form, periodEnd: e.target.value })} />
              </label>
            </div>
            <p className="fin-note">
              Changing the period changes which advertising and rep pay this invoice carries.
            </p>
            <div><button className="fin-btn pri" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}

      <div className="fin-subtabs" role="tablist">
        <button role="tab" aria-selected={tab === 'overview'}
                className="fin-subtab" onClick={() => setTab('overview')}>
          Overview
        </button>
        <button role="tab" aria-selected={tab === 'cases'}
                className="fin-subtab" onClick={() => setTab('cases')}>
          Signed cases <span className="fin-count fin-num">{num(pcs.length)}</span>
        </button>
      </div>

      {tab === 'overview' ? (
        <>
          <div className="fin-figs">
            <div className="fin-fig">
              <span className="fin-fig-l">Revenue</span>
              <span className="fin-fig-v fin-num">{usd(invoice.revenue)}</span>
              <span className="fin-fig-s">{invoice.revenue ? 'billed' : 'nothing billed yet'}</span>
            </div>
            <div className="fin-fig">
              <span className="fin-fig-l">Advertising</span>
              <span className="fin-fig-v fin-num">{usd(invoice.adSpend)}</span>
              <span className="fin-fig-s">spend in this period</span>
            </div>
            <div className="fin-fig">
              <span className="fin-fig-l">Worker cost</span>
              <span className="fin-fig-v fin-num">{usd(invoice.workerCost)}</span>
              <span className="fin-fig-s">
                {usd(invoice.basePay)} hours · {usd(invoice.commission)} commission
              </span>
            </div>
            <div className="fin-fig">
              <span className="fin-fig-l">Profit</span>
              <span className={`fin-fig-v fin-num ${tone(invoice.profit)}`}>{usd(invoice.profit)}</span>
              <span className="fin-fig-s">revenue less both</span>
            </div>
            <div className="fin-fig">
              <span className="fin-fig-l">Margin</span>
              <span className={`fin-fig-v fin-num ${tone(invoice.margin)}`}>{pct(invoice.margin)}</span>
              <span className="fin-fig-s">{invoice.margin == null ? 'no revenue' : 'of revenue'}</span>
            </div>
          </div>

          <div className="fin-eq fin-num">
            <b>{usd(invoice.revenue)}</b>
            <span className="op">−</span><b>{usd(invoice.adSpend)}</b><span className="op">ads</span>
            <span className="op">−</span><b>{usd(invoice.workerCost)}</b><span className="op">workers</span>
            <span className="op">=</span>
            <span className={`res ${tone(invoice.profit)}`}>{usd(invoice.profit)} · {pct(invoice.margin)}</span>
          </div>

          <section className="fin-sec">
            <h2 className="fin-sec-h">Per case</h2>
            <div className="fin-figs">
              <div className="fin-fig">
                <span className="fin-fig-l">Cases</span>
                <span className="fin-fig-v fin-num">{num(originals)}</span>
                <span className="fin-fig-s">{num(replacements)} replacements excluded</span>
              </div>
              <div className="fin-fig">
                <span className="fin-fig-l">Revenue per case</span>
                <span className="fin-fig-v fin-num">{usd(perCase)}</span>
                <span className="fin-fig-s">billed ÷ cases</span>
              </div>
              <div className="fin-fig">
                <span className="fin-fig-l">Ad cost per case</span>
                <span className="fin-fig-v fin-num">{usd(cac)}</span>
                <span className="fin-fig-s">spend ÷ cases</span>
              </div>
              <div className="fin-fig">
                <span className="fin-fig-l">Billed on invoice</span>
                <span className="fin-fig-v fin-num">{num(invoice.caseCount)}</span>
                <span className="fin-fig-s">
                  {invoice.caseCount != null && invoice.caseCount !== originals
                    ? `${Math.abs(invoice.caseCount - originals)} apart from the case list`
                    : 'matches the case list'}
                </span>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section>
          <p className="fin-sub" style={{ margin: '0 0 12px' }}>
            {num(originals)} cases{replacements > 0 ? ` and ${num(replacements)} replacements` : ''}
            {otCount > 0 ? ` · ${num(otCount)} closed on overtime` : ''}
            {' · '}{usd(invoice.commission)} of commission on this invoice
          </p>

          <div className="fin-card fin-scroll">
            <table className="fin-table">
              <thead><tr>
                <th>Name</th><th>Signed</th><th>Closed by</th><th>Creative</th>
                <th className="n">Overtime close</th>
                <th className="n">Change</th>
              </tr></thead>
              <tbody>
                {pcs.slice(0, 500).map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      {p.isReplacement && <span className="fin-tag warn" style={{ marginLeft: 6 }}>replacement</span>}
                    </td>
                    {/* The Pacific day it signed — the day the book counts
                        it on, which is not the UTC day it was written. */}
                    <td className="fin-num">{dayShort(financeDay(p.signedAt))}</td>
                    <td>{p.closer ?? '—'}</td>
                    <td className="fin-note" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.adName ?? '—'}
                    </td>
                    <td className="n">
                      <button
                        className={`fin-ot${p.otClose ? ' on' : ''}`}
                        onClick={() => toggleOt(p)}
                        disabled={savingOt === p.id}
                        aria-pressed={p.otClose}
                        title={p.otClose
                          ? 'Paid a flat $50. Click to put it back on the tier rate.'
                          : 'Mark as an overtime close — pays a flat $50 instead of the tier rate.'}
                      >
                        {savingOt === p.id ? '…' : p.otClose ? 'OT close' : 'Mark OT'}
                      </button>
                    </td>
                    <td className="n">
                      <CaseActions
                        id={p.id}
                        name={p.name}
                        firmId={p.firmId}
                        invoiceCode={p.invoiceCode}
                        isReplacement={p.isReplacement}
                        firms={routeFirms}
                        invoices={routeInvoices}
                        onChanged={caseChanged}
                      />
                    </td>
                  </tr>
                ))}
                {pcs.length === 0 && (
                  <tr><td colSpan={6} className="fin-empty">
                    No cases stamped with {invoice.code}, and none signed inside its period.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {pcs.length > 500 && (
            <p className="fin-note" style={{ marginTop: 10 }}>
              Showing the first 500 of {num(pcs.length)}.
            </p>
          )}
        </section>
      )}
    </>
  )
}
