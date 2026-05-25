'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { invoiceCodeFromRouteSegment } from '@/app/metrics/firms/_lib/invoice-routes'

const CARD = '#FFFFFF'
const BORDER = '#D9D3C8'
const TEXT = '#1A1A1A'
const MUTED = '#6B6560'
const ACCENT = '#C17A4A'

export default function InvoiceSectionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const slug = params.slug as string
  const invSeg = params.invoice as string
  const code = invoiceCodeFromRouteSegment(invSeg)
  const base = `/metrics/firms/${slug}/invoice/${invSeg}`
  const isPcs = pathname.endsWith('/pcs')
  const isMarketing = pathname.endsWith('/marketing')
  const isHr = pathname.endsWith('/hr')
  const isFinances = pathname.endsWith('/finances')

  const [firmName, setFirmName] = useState<string>(slug)
  const [invoice, setInvoice] = useState<{ id: string; start: string; end: string; title: string | null } | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  function loadInvoice() {
    fetch(`/api/metrics/firm-invoices?firm=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => {
        if (d.firm?.name) setFirmName(d.firm.name)
        const inv = (d.invoices || []).find((x: { code: string }) => x.code === code)
        if (inv) setInvoice({ id: inv.id, start: inv.period_start, end: inv.period_end, title: inv.title })
      })
  }

  useEffect(() => { loadInvoice() }, [slug, code])

  function openEdit() {
    if (!invoice) return
    setEditTitle(invoice.title || ''); setEditStart(invoice.start); setEditEnd(invoice.end); setEditError(''); setShowEdit(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!invoice || !editStart || !editEnd) return
    setEditSaving(true); setEditError('')
    const res = await fetch('/api/metrics/firm-invoices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: invoice.id, title: editTitle, period_start: editStart, period_end: editEnd }) })
    const data = await res.json(); setEditSaving(false)
    if (!res.ok) { setEditError(data.error || 'Failed to save.'); return }
    setShowEdit(false); loadInvoice()
  }

  const inputStyle = { background: '#F5F0E8', border: `1px solid ${BORDER}`, color: TEXT }

  return (
    <div style={{ minHeight: '100vh', background: '#EDE8DF', color: TEXT }}>
      {/* Breadcrumb */}
      <div className="px-6 py-3 flex flex-wrap items-center gap-3 text-sm" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        <Link href="/metrics" className="transition" style={{ color: MUTED }}
          onMouseEnter={e => (e.currentTarget.style.color = TEXT)} onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>Metrics</Link>
        <span style={{ color: '#D1D5DB' }}>/</span>
        <Link href={`/metrics/firms/${slug}`} className="transition" style={{ color: MUTED }}
          onMouseEnter={e => (e.currentTarget.style.color = TEXT)} onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>{firmName}</Link>
        <span style={{ color: '#D1D5DB' }}>/</span>
        <span className="font-semibold" style={{ color: TEXT }}>{code}</span>
        {invoice && (
          <>
            <span className="text-xs ml-1" style={{ color: MUTED }}>
              {invoice.title ? `${invoice.title} · ` : ''}{invoice.start} → {invoice.end}
            </span>
            <button onClick={openEdit} className="text-xs ml-1 transition" style={{ color: MUTED }} title="Edit invoice dates">✎</button>
          </>
        )}
      </div>

      {/* Tab nav */}
      <div className="px-6 flex gap-0" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        {[
          { label: 'Dashboard', href: base, active: !isPcs && !isMarketing && !isHr && !isFinances },
          { label: 'Signed PCs', href: `${base}/pcs`, active: isPcs },
          { label: 'Marketing', href: `${base}/marketing`, active: isMarketing },
          { label: 'HR', href: `${base}/hr`, active: isHr },
          { label: 'Finances', href: `${base}/finances`, active: isFinances },
        ].map(tab => (
          <Link key={tab.label} href={tab.href}
            className="px-4 py-2.5 text-sm transition font-medium"
            style={tab.active
              ? { color: TEXT, borderBottom: `2px solid ${TEXT}` }
              : { color: MUTED, borderBottom: '2px solid transparent' }}>
            {tab.label}
          </Link>
        ))}
      </div>

      {children}

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl p-6 w-full max-w-sm space-y-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <h2 className="text-base font-semibold" style={{ color: TEXT }}>Edit Invoice — {code}</h2>
            <form onSubmit={saveEdit} className="space-y-3">
              {[
                { label: 'Title (optional)', type: 'text', val: editTitle, onChange: setEditTitle, placeholder: 'e.g. Invoice 1' },
                { label: 'Period Start', type: 'date', val: editStart, onChange: setEditStart },
                { label: 'Period End', type: 'date', val: editEnd, onChange: setEditEnd },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs block mb-1" style={{ color: MUTED }}>{f.label}</label>
                  <input type={f.type} value={f.val} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                    className="w-full text-sm rounded-lg px-3 py-2 focus:outline-none" style={inputStyle} />
                </div>
              ))}
              {editError && <p className="text-xs" style={{ color: '#B91C1C' }}>{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={editSaving}
                  className="flex-1 text-sm font-medium py-2 rounded-lg transition disabled:opacity-50"
                  style={{ background: TEXT, color: '#FFF' }}>
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowEdit(false)}
                  className="flex-1 text-sm py-2 rounded-lg transition" style={{ background: '#F5F0E8', color: MUTED, border: `1px solid ${BORDER}` }}>
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
