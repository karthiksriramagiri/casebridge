'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { invoicePathSegment } from '@/app/metrics/firms/_lib/invoice-routes'

type FirmInvoice = {
  id: string
  code: string
  title: string | null
  period_start: string
  period_end: string
  sort_order: number
}

const BLANK_INV = { code: '', title: '', period_start: '', period_end: '', payment_received: '', payment_interest_rate: '' }
const BLANK_EDIT = { id: '', code: '', title: '', period_start: '', period_end: '', payment_received: '', payment_interest_rate: '' }

type MetaSummary = {
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number | null
  ctrPct: number | null
  connected: boolean
}

type InvoiceBreakdown = {
  invoiceCode: string
  signedCases: number
  originalCases: number
  replacementCases: number
  totalVictims: number
  grossRevenue: number
}

function fmt(n: number, decimals = 0) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtNum(n: number) {
  return n.toLocaleString('en-US')
}

export default function FirmInvoicesHome() {
  const params = useParams()
  const slug = params.slug as string
  const [firmName, setFirmName] = useState('')
  const [invoices, setInvoices] = useState<FirmInvoice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [setupHint, setSetupHint] = useState<string | null>(null)

  const [meta, setMeta] = useState<MetaSummary | null>(null)
  const [invoiceBreakdown, setInvoiceBreakdown] = useState<InvoiceBreakdown[]>([])
  const [totalCases, setTotalCases] = useState(0)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [showAddInvoice, setShowAddInvoice] = useState(false)
  const [invForm, setInvForm] = useState(BLANK_INV)
  const [invSaving, setInvSaving] = useState(false)
  const [invError, setInvError] = useState<string | null>(null)

  const [showEditInvoice, setShowEditInvoice] = useState(false)
  const [editForm, setEditForm] = useState(BLANK_EDIT)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/metrics/firm-invoices?firm=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => {
        setError(null)
        setSetupHint(null)
        if (d.error) {
          setError(d.error)
          return
        }
        setFirmName(d.firm?.name || slug)
        setInvoices(d.invoices || [])
        if (d.setupRequired && d.setupHint) setSetupHint(d.setupHint)
      })
      .catch(() => setError('Failed to load firm'))
  }, [slug])

  useEffect(() => {
    setKpiLoading(true)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&date_preset=maximum`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setMeta(d.meta || null)
          setInvoiceBreakdown(d.invoiceBreakdown || [])
          setTotalCases(d.summary?.originalCases ?? 0)
        }
      })
      .catch(() => {})
      .finally(() => setKpiLoading(false))
  }, [slug])

  function openEditInvoice(inv: FirmInvoice, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditForm({
      id: inv.id,
      code: inv.code,
      title: inv.title || '',
      period_start: inv.period_start,
      period_end: inv.period_end,
      payment_received: '',
      payment_interest_rate: '',
    })
    setEditError(null)
    setShowEditInvoice(true)
  }

  async function saveEditInvoice(e: React.FormEvent) {
    e.preventDefault()
    setEditSaving(true)
    setEditError(null)
    const res = await fetch('/api/metrics/firm-invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editForm.id,
        title: editForm.title,
        period_start: editForm.period_start,
        period_end: editForm.period_end,
        ...(editForm.payment_received ? { payment_received: editForm.payment_received } : {}),
        ...(editForm.payment_interest_rate ? { payment_interest_rate: editForm.payment_interest_rate } : {}),
      }),
    })
    const data = await res.json()
    setEditSaving(false)
    if (data.error) { setEditError(data.error); return }
    setInvoices(prev => prev.map(inv => inv.id === editForm.id
      ? { ...inv, title: data.invoice.title, period_start: data.invoice.period_start, period_end: data.invoice.period_end }
      : inv
    ))
    setShowEditInvoice(false)
  }

  async function addInvoice(e: React.FormEvent) {
    e.preventDefault()
    setInvSaving(true)
    setInvError(null)
    const res = await fetch('/api/metrics/firm-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firm_slug: slug, ...invForm }),
    })
    const data = await res.json()
    setInvSaving(false)
    if (data.error) { setInvError(data.error); return }
    setInvoices(prev => [...prev, data.invoice])
    setShowAddInvoice(false)
    setInvForm(BLANK_INV)
  }

  const BG = '#EDE8DF', CARD = '#FFFFFF', BORDER = '#D9D3C8', TEXT = '#1A1A1A', MUTED = '#6B6560', ACCENT = '#C17A4A'
  const inputStyle = { background: '#F5F0E8', border: `1px solid ${BORDER}`, color: TEXT }

  function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold" style={{ color: TEXT }}>{title}</h2>
            <button onClick={onClose} className="text-xl transition" style={{ color: MUTED }}>×</button>
          </div>
          {children}
        </div>
      </div>
    )
  }

  function InvoiceFormFields({ form, setForm }: { form: typeof BLANK_INV; setForm: React.Dispatch<React.SetStateAction<typeof BLANK_INV>> }) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: MUTED }}>Code * <span style={{ color: '#B5AFA8' }}>(e.g. INV-4)</span></label>
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="INV-4" required className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: MUTED }}>Title</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Invoice 4" className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: MUTED }}>Period Start *</label>
          <input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} required className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: MUTED }}>Period End *</label>
          <input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} required className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: MUTED }}>Payment Received ($)</label>
          <input type="number" value={form.payment_received} onChange={e => setForm(f => ({ ...f, payment_received: e.target.value }))} placeholder="35000" className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: MUTED }}>Interest Rate <span style={{ color: '#B5AFA8' }}>(e.g. 0.03)</span></label>
          <input type="number" step="0.001" value={form.payment_interest_rate} onChange={e => setForm(f => ({ ...f, payment_interest_rate: e.target.value }))} placeholder="0.03" className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center gap-4" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/metrics" className="text-sm transition" style={{ color: MUTED }}
          onMouseEnter={e => (e.currentTarget.style.color = TEXT)} onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>← Metrics</Link>
        <div className="w-px h-4" style={{ background: BORDER }} />
        <h1 className="text-lg font-bold" style={{ color: TEXT }}>{firmName || slug.toUpperCase()}</h1>
      </div>

      <div className="p-6 max-w-5xl space-y-8">
        {/* Meta Stats */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Meta Ad Spend — All Time</h2>
            {meta && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={meta.connected
                ? { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }
                : { background: '#F3F4F6', color: MUTED, border: `1px solid ${BORDER}` }}>
                {meta.connected ? 'Connected' : 'No account'}
              </span>
            )}
          </div>
          {kpiLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="rounded-xl p-4 h-20 animate-pulse" style={{ background: CARD, border: `1px solid ${BORDER}` }} />)}
            </div>
          ) : (meta as any)?.error ? (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="font-medium mb-1" style={{ color: '#B91C1C' }}>Meta API error</p>
              <p style={{ color: '#DC2626' }}>{(meta as any).error}</p>
            </div>
          ) : meta ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              {[
                { label: 'Total Spend', value: fmt(meta.spend, 2) },
                { label: 'Impressions', value: fmtNum(meta.impressions) },
                { label: 'Clicks', value: fmtNum(meta.clicks) },
                { label: 'Meta Leads', value: fmtNum(meta.leads) },
                { label: 'CPL', value: meta.cpl != null ? fmt(meta.cpl, 2) : '—' },
                { label: 'CPQ', value: totalCases > 0 ? fmt(meta.spend / totalCases, 2) : '—' },
                { label: 'CTR', value: meta.ctrPct != null ? meta.ctrPct.toFixed(2) + '%' : '—' },
              ].map(c => (
                <div key={c.label} className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-xs mb-1 uppercase tracking-wider" style={{ color: MUTED }}>{c.label}</p>
                  <p className="text-lg font-bold" style={{ color: TEXT }}>{c.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: MUTED }}>Meta data unavailable — check META_ACCESS_TOKEN env var.</p>
          )}
        </div>

        {/* Invoice Breakdown */}
        {invoiceBreakdown.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Signed Cases by Invoice</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {invoiceBreakdown.map(b => (
                <Link key={b.invoiceCode} href={`/metrics/firms/${slug}/invoice/${invoicePathSegment(b.invoiceCode)}/pcs`}
                  className="block rounded-xl p-4 transition hover:shadow-md" style={{ background: CARD, border: `1px solid ${BORDER}`, textDecoration: 'none' }}>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: MUTED }}>{b.invoiceCode}</p>
                  <p className="text-2xl font-bold mb-1" style={{ color: TEXT }}>{b.originalCases}</p>
                  <p className="text-xs" style={{ color: MUTED }}>
                    {b.totalVictims} victim{b.totalVictims !== 1 ? 's' : ''} · {fmt(b.grossRevenue)} gross rev
                    {b.replacementCases > 0 && ` · ${b.replacementCases} replacement${b.replacementCases !== 1 ? 's' : ''}`}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm" style={{ color: '#B91C1C' }}>{error}</p>}

        {setupHint && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p className="font-medium mb-1" style={{ color: '#92400E' }}>Database setup needed</p>
            <p style={{ color: '#78350F' }}>{setupHint}</p>
            <p className="text-xs mt-2" style={{ color: '#92400E' }}>
              File in repo: <code>supabase/migration_firm_invoice_periods.sql</code>
            </p>
          </div>
        )}

        {/* Invoices */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Invoices</h2>
            <button onClick={() => setShowAddInvoice(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition font-medium"
              style={{ background: TEXT, color: '#FFF' }}>
              + Add Invoice
            </button>
          </div>
          <p className="text-sm mb-4" style={{ color: MUTED }}>
            Open an invoice to see Meta spend, P&amp;L, and ops expenses for that billing window.
          </p>
          {invoices.length === 0 && !error && !setupHint && (
            <p className="text-sm" style={{ color: MUTED }}>
              No invoices configured. Run{' '}
              <code style={{ color: TEXT }}>supabase/migration_firm_invoice_periods.sql</code>
              {' '}and add rows in <code style={{ color: TEXT }}>firm_invoices</code>.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {invoices.map(inv => {
              const breakdown = invoiceBreakdown.find(b => b.invoiceCode === inv.code)
              return (
                <div key={inv.id} className="relative group">
                  <Link href={`/metrics/firms/${slug}/invoice/${invoicePathSegment(inv.code)}`}
                    className="block rounded-xl p-5 transition" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: MUTED }}>{inv.code}</p>
                    <p className="font-semibold mb-2 transition" style={{ color: TEXT }}>{inv.title || inv.code}</p>
                    <p className="text-sm mb-3" style={{ color: MUTED }}>{inv.period_start} → {inv.period_end}</p>
                    {breakdown && (
                      <p className="text-xs" style={{ color: MUTED }}>
                        {breakdown.signedCases} case{breakdown.signedCases !== 1 ? 's' : ''} · {fmt(breakdown.grossRevenue)} gross
                      </p>
                    )}
                    <p className="text-xs mt-2" style={{ color: '#B5AFA8' }}>Dashboard · Creatives · PCs</p>
                  </Link>
                  <button onClick={e => openEditInvoice(inv, e)}
                    className="absolute top-3 right-3 text-sm opacity-0 group-hover:opacity-100 transition" style={{ color: MUTED }} title="Edit invoice">✎</button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showEditInvoice && (
        <Modal title={`Edit Invoice — ${editForm.code}`} onClose={() => setShowEditInvoice(false)}>
          <form onSubmit={saveEditInvoice} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs mb-1" style={{ color: MUTED }}>Title</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Invoice 1" className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>Period Start *</label>
                <input type="date" value={editForm.period_start} onChange={e => setEditForm(f => ({ ...f, period_start: e.target.value }))} required className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>Period End *</label>
                <input type="date" value={editForm.period_end} onChange={e => setEditForm(f => ({ ...f, period_end: e.target.value }))} required className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>Payment Received ($)</label>
                <input type="number" value={editForm.payment_received} onChange={e => setEditForm(f => ({ ...f, payment_received: e.target.value }))} placeholder="35000" className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>Interest Rate</label>
                <input type="number" step="0.001" value={editForm.payment_interest_rate} onChange={e => setEditForm(f => ({ ...f, payment_interest_rate: e.target.value }))} placeholder="0.03" className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
              </div>
            </div>
            {editError && <p className="text-xs" style={{ color: '#B91C1C' }}>{editError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={editSaving} className="flex-1 text-sm py-2 rounded-lg transition disabled:opacity-50" style={{ background: TEXT, color: '#FFF' }}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
              <button type="button" onClick={() => setShowEditInvoice(false)} className="px-4 text-sm py-2 rounded-lg transition" style={{ background: '#F5F0E8', color: MUTED, border: `1px solid ${BORDER}` }}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {showAddInvoice && (
        <Modal title="Add Invoice" onClose={() => { setShowAddInvoice(false); setInvError(null) }}>
          <form onSubmit={addInvoice} className="space-y-4">
            <InvoiceFormFields form={invForm} setForm={setInvForm} />
            {invError && <p className="text-xs" style={{ color: '#B91C1C' }}>{invError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={invSaving} className="flex-1 text-sm py-2 rounded-lg transition disabled:opacity-50" style={{ background: TEXT, color: '#FFF' }}>{invSaving ? 'Saving...' : 'Create Invoice'}</button>
              <button type="button" onClick={() => { setShowAddInvoice(false); setInvError(null) }} className="px-4 text-sm py-2 rounded-lg transition" style={{ background: '#F5F0E8', color: MUTED, border: `1px solid ${BORDER}` }}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
