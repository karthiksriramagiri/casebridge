'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usd, pct, num } from '../_components/fmt'

/* Every client firm. Each opens onto its invoices, and an invoice opens onto
   its own P&L — the same three steps as before, in the new theme. */

const BLANK = {
  name: '', slug: '', case_value: '', meta_account_id: 'act_788484706914452',
  replacement_window_days: '14',
}

export default function FirmsPage() {
  const [firms, setFirms] = useState<any[]>([])
  const [book, setBook] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState(BLANK)
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    const [fr, bk] = await Promise.all([
      fetch('/api/metrics/firms').then(r => r.json()).catch(() => ({})),
      fetch('/api/finance/book').then(r => r.json()).catch(() => ({})),
    ])
    setFirms(fr.firms ?? [])
    setBook(bk.error ? null : bk)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function addFirm(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const res = await fetch('/api/metrics/firms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...f,
        case_value: f.case_value ? Number(f.case_value) : null,
        replacement_window_days: Number(f.replacement_window_days) || 14,
      }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d.error || 'Could not add that firm.'); return }
    setF(BLANK); setShowAdd(false); await load()
  }

  if (loading) return <p className="fin-note">Loading…</p>

  const stats = (id: string) => (book?.firms ?? []).find((x: any) => x.id === id)
  const visible = firms.filter(x => showArchived || !x.archived)
  const archived = firms.filter(x => x.archived).length

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Firms</h1>
          <p className="fin-sub">Open a firm for its invoices and delivery</p>
        </div>
        <button className="fin-btn pri" onClick={() => setShowAdd(s => !s)}>
          {showAdd ? 'Cancel' : 'Add firm'}
        </button>
      </div>

      {showAdd && (
        <div className="fin-card" style={{ marginBottom: 20 }}>
          <div className="fin-card-h"><span className="fin-card-t">New firm</span></div>
          <form className="fin-form" onSubmit={addFirm}>
            <div className="fin-row2">
              <label className="fin-field">
                <span>Name</span>
                <input className="fin-input" value={f.name} required
                       onChange={e => setF({ ...f, name: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>Slug</span>
                <input className="fin-input" value={f.slug} required placeholder="mca"
                       onChange={e => setF({ ...f, slug: e.target.value })} />
              </label>
            </div>
            <div className="fin-row3">
              <label className="fin-field">
                <span>Case value</span>
                <input className="fin-input fin-num" value={f.case_value} inputMode="decimal"
                       placeholder="2000" onChange={e => setF({ ...f, case_value: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>Meta account</span>
                <input className="fin-input" value={f.meta_account_id}
                       onChange={e => setF({ ...f, meta_account_id: e.target.value })} />
              </label>
              <label className="fin-field">
                <span>Replacement window</span>
                <input className="fin-input fin-num" value={f.replacement_window_days} inputMode="numeric"
                       onChange={e => setF({ ...f, replacement_window_days: e.target.value })} />
              </label>
            </div>
            {err && <p className="fin-err">{err}</p>}
            <div><button className="fin-btn pri" disabled={busy}>{busy ? 'Adding…' : 'Add firm'}</button></div>
          </form>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="fin-card"><p className="fin-empty">
          No firms yet. Add one to start attributing spend, cases and invoices.
        </p></div>
      ) : (
        <div className="fin-grid">
          {visible.map(firm => {
            const s = stats(firm.id)
            return (
              <Link key={firm.id} href={`/finance/firms/${firm.slug}`} className="fin-tile">
                <div className="fin-tile-h">
                  <span className="fin-tile-name">{firm.name}</span>
                  {firm.archived && <span className="fin-tag">archived</span>}
                  <span className="fin-tile-arrow" aria-hidden="true">→</span>
                </div>
                <div className="fin-tile-figs">
                  <div>
                    <span className="fin-fig-l">Revenue</span>
                    <span className="fin-tile-v fin-num">{s ? usd(s.revenue) : '—'}</span>
                  </div>
                  <div>
                    <span className="fin-fig-l">Margin</span>
                    <span className="fin-tile-v fin-num">{s ? pct(s.margin, 0) : '—'}</span>
                  </div>
                  <div>
                    <span className="fin-fig-l">Invoices</span>
                    <span className="fin-tile-v fin-num">{s ? num(s.invoiceCount) : '—'}</span>
                  </div>
                </div>
                <div className="fin-tile-foot">
                  <span>Case value {firm.case_value ? usd(Number(firm.case_value)) : 'not set'}</span>
                  <span>{firm.meta_account_id ? 'Meta connected' : 'Meta not linked'}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {archived > 0 && (
        <p className="fin-note" style={{ marginTop: 16 }}>
          <button className="fin-btn" onClick={() => setShowArchived(s => !s)}>
            {showArchived ? 'Hide' : 'Show'} {archived} archived
          </button>
        </p>
      )}
    </>
  )
}
