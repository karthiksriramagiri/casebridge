'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { invoiceCodeFromRouteSegment } from '@/app/finance/firms/_lib/invoice-routes'
import { MetricsHeader, Breadcrumbs } from '@/app/_metrics/chrome'
import {
  Overlay, Banner, InlineEdit, shortDate,
  IconClose, IconCalendar, IconWarn,
} from '@/app/_metrics/dash'

type Invoice = {
  id: string
  start: string
  end: string
  title: string | null
}

export default function InvoiceSectionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname() || ''
  const slug = params.slug as string
  const invSeg = params.invoice as string
  const code = invoiceCodeFromRouteSegment(invSeg)
  const base = `/finance/firms/${slug}/invoice/${invSeg}`

  const [firmName, setFirmName] = useState(slug)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [showEdit, setShowEdit] = useState(false)

  const loadInvoice = useCallback(() => {
    fetch(`/api/metrics/firm-invoices?firm=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => {
        if (d.firm?.name) setFirmName(d.firm.name)
        const inv = (d.invoices || []).find((x: { code: string }) => x.code === code)
        if (inv) setInvoice({ id: inv.id, start: inv.period_start, end: inv.period_end, title: inv.title })
      })
      .catch(() => {})
  }, [slug, code])

  useEffect(() => { loadInvoice() }, [loadInvoice])

  async function saveTitle(title: string) {
    if (!invoice) return
    await fetch('/api/metrics/firm-invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: invoice.id, title, period_start: invoice.start, period_end: invoice.end }),
    })
    setInvoice(inv => (inv ? { ...inv, title } : inv))
  }

  /* The Team section was previously only reachable by typing the URL — it had
     no entry in this nav at all. It is a real page, so it gets a tab. */
  const sections = [
    { label: 'Overview', href: base },
    { label: 'Creatives', href: `${base}/marketing` },
    { label: 'Signed cases', href: `${base}/pcs` },
    { label: 'Team', href: `${base}/hr` },
    { label: 'Finances', href: `${base}/finances` },
  ]

  const activeHref = sections
    .filter(s => pathname === s.href || pathname.startsWith(s.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? base

  return (
    <>
      <MetricsHeader />

      <div className="mx-idbar">
        <div className="mx-idbar-inner">
          <div style={{ minWidth: 0 }}>
            <Breadcrumbs items={[
              
              { label: firmName, href: `/finance/firms/${slug}` },
              { label: code },
            ]} />
            <h1 style={{ margin: '6px 0 0', minWidth: 0 }}>
              {invoice ? (
                <InlineEdit
                  variant="title"
                  value={invoice.title || ''}
                  placeholder={`Name ${code}`}
                  onSave={saveTitle}
                />
              ) : (
                <span className="mx-idbar-title">{code}</span>
              )}
            </h1>
          </div>

          <div className="mx-idbar-spacer">
            {invoice ? (
              <button className="mx-btn mx-btn-quiet" onClick={() => setShowEdit(true)}
                title="Change the billing window or record the payment">
                <IconCalendar />
                {shortDate(invoice.start)} – {shortDate(invoice.end)}
              </button>
            ) : (
              <span className="mx-skel" style={{ height: 30, width: 168, borderRadius: 8 }} />
            )}
          </div>
        </div>
      </div>

      <nav className="mx-subnav" aria-label="Invoice sections">
        <div className="mx-subnav-inner">
          {sections.map(s => (
            <Link key={s.href} href={s.href} className="mx-tab"
              aria-current={activeHref === s.href ? 'page' : undefined}>
              {s.label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-main" id="mx-main">{children}</main>

      {showEdit && invoice && (
        <EditInvoiceDialog
          code={code}
          invoice={invoice}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadInvoice() }}
        />
      )}
    </>
  )
}

/* ── Edit dialog ────────────────────────────────────────────────────────────
   Also records the payment, which previously lived only on the firm page's
   invoice form — so the number that drives every margin on these pages could
   not be corrected from inside the invoice itself.                           */

function EditInvoiceDialog({ code, invoice, onClose, onSaved }: {
  code: string
  invoice: Invoice
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(invoice.title || '')
  const [start, setStart] = useState(invoice.start)
  const [end, setEnd] = useState(invoice.end)
  const [received, setReceived] = useState('')
  const [rate, setRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!start || !end) { setError('Both period dates are required.'); return }
    if (end < start) { setError('The period ends before it starts.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/metrics/firm-invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: invoice.id, title, period_start: start, period_end: end,
          ...(received ? { payment_received: received } : {}),
          ...(rate ? { payment_interest_rate: rate } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || 'The invoice could not be saved.'); return }
      onSaved()
    } catch {
      setError('Connection failed. Please try again.')
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose} variant="dialog" labelledBy="inv-edit-title">
      <div className="mx-dialog-head">
        <h2 id="inv-edit-title" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Edit {code}</h2>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      <div className="mx-dialog-body">
        <form id="inv-edit-form" onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
          <div className="mx-field" style={{ gridColumn: '1 / -1' }}>
            <label className="mx-label" htmlFor="ie-title">Title</label>
            <input id="ie-title" className="mx-input" value={title} placeholder={code}
              onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="mx-field">
            <label className="mx-label" htmlFor="ie-start">Period start</label>
            <input id="ie-start" className="mx-input" type="date" value={start} max={end}
              onChange={e => setStart(e.target.value)} />
          </div>
          <div className="mx-field">
            <label className="mx-label" htmlFor="ie-end">Period end</label>
            <input id="ie-end" className="mx-input" type="date" value={end} min={start}
              onChange={e => setEnd(e.target.value)} />
          </div>

          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <Banner>
              Leave the payment fields blank to keep what is already recorded. Filling them replaces it,
              and every margin on this invoice recalculates from the net figure.
            </Banner>
          </div>

          <div className="mx-field">
            <label className="mx-label" htmlFor="ie-recv">Payment received</label>
            <input id="ie-recv" className="mx-input" type="number" value={received} placeholder="35000"
              onChange={e => setReceived(e.target.value)} />
          </div>
          <div className="mx-field">
            <label className="mx-label" htmlFor="ie-rate">Fee rate</label>
            <input id="ie-rate" className="mx-input" type="number" step="0.001" value={rate} placeholder="0.03"
              onChange={e => setRate(e.target.value)} />
            <span className="mx-hint">As a decimal — 0.03 is a 3% fee.</span>
          </div>

          {error && <p className="mx-error" style={{ gridColumn: '1 / -1' }}><IconWarn size={13} /> {error}</p>}
        </form>
      </div>

      <div className="mx-dialog-foot" style={{ justifyContent: 'flex-end' }}>
        <button className="mx-btn mx-btn-quiet" type="button" onClick={onClose}>Cancel</button>
        <button className="mx-btn mx-btn-primary" type="submit" form="inv-edit-form" disabled={saving}>
          {saving ? 'Saving…' : 'Save invoice'}
        </button>
      </div>
    </Overlay>
  )
}
