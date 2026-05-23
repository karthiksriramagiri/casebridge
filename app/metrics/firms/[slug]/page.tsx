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
          setTotalCases(d.summary?.signedCases ?? 0)
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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <Link href="/metrics" className="text-gray-400 hover:text-white text-sm transition">
          ← Metrics
        </Link>
        <div className="w-px h-4 bg-gray-700" />
        <h1 className="text-lg font-bold text-white">{firmName || slug.toUpperCase()}</h1>
      </div>

      <div className="p-6 max-w-5xl space-y-8">

        {/* ── Meta Spend Panel ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Meta Ad Spend — All Time</h2>
            {meta && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${meta.connected ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                {meta.connected ? 'Connected' : 'No account'}
              </span>
            )}
          </div>

          {kpiLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : meta?.error ? (
            <div className="rounded-xl border border-red-500/40 bg-red-950/20 px-4 py-3 text-sm text-red-300">
              <p className="font-medium mb-1">Meta API error</p>
              <p className="text-red-300/80">{meta.error}</p>
            </div>
          ) : meta ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Spend', value: fmt(meta.spend, 2) },
                { label: 'Impressions', value: fmtNum(meta.impressions) },
                { label: 'Clicks', value: fmtNum(meta.clicks) },
                { label: 'Meta Leads', value: fmtNum(meta.leads) },
                { label: 'CPL', value: meta.cpl != null ? fmt(meta.cpl, 2) : '—' },
                { label: 'CTR', value: meta.ctrPct != null ? meta.ctrPct.toFixed(2) + '%' : '—' },
              ].map(c => (
                <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                  <p className="text-lg font-bold text-white">{c.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Meta data unavailable — check META_ACCESS_TOKEN env var.</p>
          )}
        </div>

        {/* ── Invoice Breakdown ── */}
        {invoiceBreakdown.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Signed Cases by Invoice</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {invoiceBreakdown.map(b => (
                <div key={b.invoiceCode} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{b.invoiceCode}</p>
                  <p className="text-2xl font-bold text-white mb-1">{b.signedCases}</p>
                  <p className="text-xs text-gray-500">
                    {b.totalVictims} victim{b.totalVictims !== 1 ? 's' : ''} · {fmt(b.grossRevenue)} gross rev
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-red-400">{error}</p>}

        {setupHint && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90">
            <p className="font-medium text-amber-200 mb-1">Database setup needed</p>
            <p className="text-amber-100/80">{setupHint}</p>
            <p className="text-xs text-amber-200/60 mt-2">
              File in repo: <code className="text-amber-200/90">supabase/migration_firm_invoice_periods.sql</code>
            </p>
          </div>
        )}

        {/* ── Invoice Cards ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Invoices</h2>
            <button onClick={() => setShowAddInvoice(true)}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition">
              + Add Invoice
            </button>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            Open an invoice to see Meta spend, P&amp;L, and ops expenses for that billing window.
          </p>

          {invoices.length === 0 && !error && !setupHint && (
            <p className="text-gray-500 text-sm">
              No invoices configured. Run{' '}
              <code className="text-gray-400">supabase/migration_firm_invoice_periods.sql</code>
              {' '}and add rows in <code className="text-gray-400">firm_invoices</code> for this firm.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {invoices.map(inv => {
              const breakdown = invoiceBreakdown.find(b => b.invoiceCode === inv.code)
              return (
                <div key={inv.id} className="relative group">
                  <Link
                    href={`/metrics/firms/${slug}/invoice/${invoicePathSegment(inv.code)}`}
                    className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-blue-500/40 transition group"
                  >
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{inv.code}</p>
                    <p className="font-semibold text-white group-hover:text-blue-300 transition mb-2">
                      {inv.title || inv.code}
                    </p>
                    <p className="text-sm text-gray-400 mb-3">
                      {inv.period_start} → {inv.period_end}
                    </p>
                    {breakdown && (
                      <p className="text-xs text-gray-500">
                        {breakdown.signedCases} case{breakdown.signedCases !== 1 ? 's' : ''} · {fmt(breakdown.grossRevenue)} gross
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mt-2">Dashboard · Creatives · PCs</p>
                  </Link>
                  <button
                    onClick={e => openEditInvoice(inv, e)}
                    className="absolute top-3 right-3 text-gray-600 hover:text-gray-300 transition text-sm opacity-0 group-hover:opacity-100"
                    title="Edit invoice"
                  >
                    ✎
                  </button>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      {/* Edit Invoice Modal */}
      {showEditInvoice && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Edit Invoice — {editForm.code}</h2>
              <button onClick={() => setShowEditInvoice(false)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <form onSubmit={saveEditInvoice} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Title</label>
                  <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Invoice 1"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Period Start *</label>
                  <input type="date" value={editForm.period_start} onChange={e => setEditForm(f => ({ ...f, period_start: e.target.value }))}
                    required
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Period End *</label>
                  <input type="date" value={editForm.period_end} onChange={e => setEditForm(f => ({ ...f, period_end: e.target.value }))}
                    required
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Payment Received ($)</label>
                  <input type="number" value={editForm.payment_received} onChange={e => setEditForm(f => ({ ...f, payment_received: e.target.value }))}
                    placeholder="35000"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Interest Rate <span className="text-gray-600">(e.g. 0.03)</span></label>
                  <input type="number" step="0.001" value={editForm.payment_interest_rate} onChange={e => setEditForm(f => ({ ...f, payment_interest_rate: e.target.value }))}
                    placeholder="0.03"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              {editError && <p className="text-red-400 text-xs">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={editSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded-lg transition disabled:opacity-50">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setShowEditInvoice(false)}
                  className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Invoice Modal */}
      {showAddInvoice && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Add Invoice</h2>
              <button onClick={() => { setShowAddInvoice(false); setInvError(null) }} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <form onSubmit={addInvoice} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Code * <span className="text-gray-600">(e.g. INV-4)</span></label>
                  <input value={invForm.code} onChange={e => setInvForm(f => ({ ...f, code: e.target.value }))}
                    placeholder="INV-4" required
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Title</label>
                  <input value={invForm.title} onChange={e => setInvForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Invoice 4"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Period Start *</label>
                  <input type="date" value={invForm.period_start} onChange={e => setInvForm(f => ({ ...f, period_start: e.target.value }))}
                    required
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Period End *</label>
                  <input type="date" value={invForm.period_end} onChange={e => setInvForm(f => ({ ...f, period_end: e.target.value }))}
                    required
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Payment Received ($)</label>
                  <input type="number" value={invForm.payment_received} onChange={e => setInvForm(f => ({ ...f, payment_received: e.target.value }))}
                    placeholder="35000"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Interest Rate <span className="text-gray-600">(e.g. 0.03)</span></label>
                  <input type="number" step="0.001" value={invForm.payment_interest_rate} onChange={e => setInvForm(f => ({ ...f, payment_interest_rate: e.target.value }))}
                    placeholder="0.03"
                    className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              {invError && <p className="text-red-400 text-xs">{invError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={invSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded-lg transition disabled:opacity-50">
                  {invSaving ? 'Saving...' : 'Create Invoice'}
                </button>
                <button type="button" onClick={() => { setShowAddInvoice(false); setInvError(null) }}
                  className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
