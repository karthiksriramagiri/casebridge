'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { invoiceCodeFromRouteSegment } from '@/app/metrics/firms/_lib/invoice-routes'

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
    setEditTitle(invoice.title || '')
    setEditStart(invoice.start)
    setEditEnd(invoice.end)
    setEditError('')
    setShowEdit(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!invoice || !editStart || !editEnd) return
    setEditSaving(true)
    setEditError('')
    const res = await fetch('/api/metrics/firm-invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: invoice.id, title: editTitle, period_start: editStart, period_end: editEnd }),
    })
    const data = await res.json()
    setEditSaving(false)
    if (!res.ok) { setEditError(data.error || 'Failed to save.'); return }
    setShowEdit(false)
    loadInvoice()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-3 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/metrics" className="text-gray-500 hover:text-white transition">Metrics</Link>
        <span className="text-gray-700">/</span>
        <Link href={`/metrics/firms/${slug}`} className="text-gray-400 hover:text-white transition">
          {firmName}
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-white font-medium">{code}</span>
        {invoice && (
          <>
            <span className="text-gray-500 text-xs ml-2">
              {invoice.title ? `${invoice.title} · ` : ''}{invoice.start} → {invoice.end}
            </span>
            <button
              onClick={openEdit}
              className="text-gray-600 hover:text-gray-300 transition text-xs ml-1"
              title="Edit invoice dates"
            >
              ✎
            </button>
          </>
        )}
      </div>
      <div className="border-b border-gray-800 px-6 flex gap-1">
        {[
          { label: 'Dashboard', href: base, active: !isPcs && !isMarketing && !isHr && !isFinances },
          { label: 'Signed PCs', href: `${base}/pcs`, active: isPcs },
          { label: 'Marketing', href: `${base}/marketing`, active: isMarketing },
          { label: 'HR', href: `${base}/hr`, active: isHr },
          { label: 'Finances', href: `${base}/finances`, active: isFinances },
        ].map(tab => (
          <Link
            key={tab.label}
            href={tab.href}
            className={`px-4 py-2.5 text-sm rounded-t-lg transition ${tab.active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}

      {/* Edit Invoice Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-semibold text-white">Edit Invoice — {code}</h2>
            <form onSubmit={saveEdit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="e.g. Invoice 1"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Period Start</label>
                <input
                  type="date"
                  value={editStart}
                  onChange={e => setEditStart(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Period End</label>
                <input
                  type="date"
                  value={editEnd}
                  onChange={e => setEditEnd(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                />
              </div>
              {editError && <p className="text-xs text-red-400">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={editSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition"
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition"
                >
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
