'use client'

import { useEffect, useRef, useState } from 'react'
export const DATE_PRESETS = [
  { label: 'Today', value: 'today' },
  { label: '7d', value: 'last_7d' },
  { label: '14d', value: 'last_14d' },
  { label: '30d', value: 'last_30d' },
  { label: 'All time', value: 'maximum' },
]

export function fmt$(n: number | null | undefined) {
  if (n == null) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toFixed(1) + '%'
}

export function KPICard({
  label, value, sub, highlight,
}: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | 'yellow' | 'blue' }) {
  const borderColor =
    highlight === 'green' ? 'border-green-500/40' :
    highlight === 'red' ? 'border-red-500/40' :
    highlight === 'yellow' ? 'border-yellow-500/40' :
    highlight === 'blue' ? 'border-blue-500/40' :
    'border-gray-800'
  const textColor =
    highlight === 'green' ? 'text-green-400' :
    highlight === 'red' ? 'text-red-400' :
    highlight === 'yellow' ? 'text-yellow-400' :
    highlight === 'blue' ? 'text-blue-400' :
    'text-white'
  return (
    <div className={`bg-gray-900 border ${borderColor} rounded-xl p-5`}>
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export function PhaseBadge({ label, color }: { label: string; color: string }) {
  const cls =
    color === 'blue' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
    color === 'purple' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
    'bg-gray-700/50 text-gray-300 border-gray-600'
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {label.toUpperCase()} PHASE
    </span>
  )
}

export function statusBadgeClass(status: string) {
  const s = (status || '').toLowerCase()
  if (s === 'closed') return 'bg-gray-700/80 text-gray-300'
  if (s === 'replacement') return 'bg-amber-900/40 text-amber-300'
  if (s === 'e_signed') return 'bg-emerald-900/40 text-emerald-300'
  return 'bg-gray-800 text-gray-400'
}

export function InsightsPanel({ data, loading, onGenerate }: {
  data: any | null
  loading: boolean
  onGenerate: () => void
}) {
  const statusColor =
    data?.status === 'critical' ? 'border-red-500/40 bg-red-950/20' :
    data?.status === 'warning' ? 'border-yellow-500/40 bg-yellow-950/20' :
    data?.status === 'good' ? 'border-green-500/40 bg-green-950/20' :
    'border-gray-700 bg-gray-900'

  return (
    <div className={`border rounded-xl p-6 ${statusColor}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200">AI Insights</h2>
        <button
          onClick={onGenerate}
          disabled={loading}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : data ? 'Refresh' : 'Generate Insights'}
        </button>
      </div>

      {loading && (
        <div className="text-gray-400 text-sm animate-pulse">Analyzing your data...</div>
      )}

      {!loading && !data && (
        <p className="text-gray-500 text-sm">Click &quot;Generate Insights&quot; to get an AI-powered diagnosis of your business performance.</p>
      )}

      {!loading && data && (
        <div className="space-y-4">
          <p className="text-white font-medium">{data.headline}</p>

          {data.findings?.length > 0 && (
            <div className="space-y-3">
              {data.findings.map((f: any, i: number) => (
                <div key={i} className="bg-black/20 rounded-lg p-4 border border-gray-700/50">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-0.5 shrink-0 w-20">{f.area}</span>
                    <div>
                      <p className="text-gray-200 text-sm">{f.finding}</p>
                      <p className="text-blue-400 text-xs mt-1.5">→ {f.action}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.benchmarks && (
            <div className="flex gap-3 flex-wrap pt-1">
              {[
                { label: 'CPQ', value: data.benchmarks.cpq_assessment },
                { label: 'Margin', value: data.benchmarks.margin_assessment },
                { label: 'Spend', value: data.benchmarks.spend_efficiency },
              ].map(b => {
                const isGood = ['good', 'healthy', 'efficient'].includes(b.value)
                const isBad = ['very_high', 'negative', 'wasteful', 'critical'].includes(b.value)
                const cls = isGood ? 'text-green-400 border-green-500/30 bg-green-950/30' :
                  isBad ? 'text-red-400 border-red-500/30 bg-red-950/30' :
                  'text-yellow-400 border-yellow-500/30 bg-yellow-950/30'
                return (
                  <span key={b.label} className={`text-xs px-2 py-1 rounded-md border ${cls}`}>
                    {b.label}: {b.value?.replace(/_/g, ' ')}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const EXPENSE_CATEGORIES = ['software', 'salary', 'office', 'marketing', 'legal', 'other']

export function ExpensesPanel({
  firmId,
  invoiceCode,
}: {
  firmId: string
  /** When set, list + new rows default to this invoice bucket */
  invoiceCode?: string | null
}) {
  const [expenses, setExpenses] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: '',
    category: 'other',
    shared: false,
    tagInvoice: true,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !firmId) return
    const q = invoiceCode
      ? `firm_id=${firmId}&invoice_code=${encodeURIComponent(invoiceCode)}`
      : `firm_id=${firmId}`
    fetch(`/api/metrics/expenses?${q}`)
      .then(r => r.json())
      .then(d => setExpenses(d.expenses || []))
  }, [open, firmId, invoiceCode])

  async function addExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || !form.date) return
    setSaving(true)
    const res = await fetch('/api/metrics/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firm_id: form.shared ? null : firmId,
        date: form.date,
        amount: form.amount,
        description: form.description,
        category: form.category,
        invoice_code: invoiceCode && form.tagInvoice ? invoiceCode : null,
      }),
    })
    const data = await res.json()
    if (data.expense) setExpenses(prev => [data.expense, ...prev])
    setForm(f => ({ ...f, amount: '', description: '' }))
    setSaving(false)
  }

  async function deleteExpense(id: string) {
    await fetch(`/api/metrics/expenses?id=${id}`, { method: 'DELETE' })
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition"
      >
        <span className="text-sm font-medium text-gray-300">
          Ops expenses
          {invoiceCode && <span className="text-gray-500 font-normal ml-2">({invoiceCode})</span>}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-gray-800 p-5 space-y-4">
          {invoiceCode && (
            <p className="text-xs text-gray-500">
              Rows dated inside this invoice window count automatically; you can also tag lines explicitly to {invoiceCode}.
            </p>
          )}
          <form onSubmit={addExpense} className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Amount ($)</label>
              <input type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none w-28" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input type="text" placeholder="e.g. Slack subscription" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none w-48" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none">
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="block text-xs text-gray-400 mb-1">Shared</label>
              <input type="checkbox" checked={form.shared} onChange={e => setForm(f => ({ ...f, shared: e.target.checked }))}
                className="w-4 h-4 accent-blue-500" />
            </div>
            {invoiceCode && (
              <div className="flex items-center gap-2">
                <label className="block text-xs text-gray-400 mb-1">Tag {invoiceCode}</label>
                <input type="checkbox" checked={form.tagInvoice} onChange={e => setForm(f => ({ ...f, tagInvoice: e.target.checked }))}
                  className="w-4 h-4 accent-blue-500" />
              </div>
            )}
            <button type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg transition disabled:opacity-50">
              {saving ? '...' : 'Add'}
            </button>
          </form>

          {expenses.length > 0 ? (
            <div className="space-y-1">
              {expenses.map(exp => (
                <div key={exp.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-800 last:border-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-gray-400 text-xs w-24">{exp.date}</span>
                    <span className="text-white">{exp.description || '—'}</span>
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{exp.category}</span>
                    {exp.invoice_code && (
                      <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded">{exp.invoice_code}</span>
                    )}
                    {!exp.firm_id && <span className="text-xs bg-yellow-900/30 text-yellow-400 px-2 py-0.5 rounded">shared</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-white font-medium">${Number(exp.amount).toLocaleString()}</span>
                    <button type="button" onClick={() => deleteExpense(exp.id)} className="text-gray-600 hover:text-red-400 transition text-xs" aria-label="Remove">×</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No expenses in this bucket yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

function CloserLeaderboard({ pcs }: { pcs: any[] }) {
  const originals = pcs.filter(p => (p.caseStatus || '').toLowerCase() !== 'replacement')
  const byCloser: Record<string, { name: string; total: number; originals: number }> = {}
  for (const pc of originals) {
    const name = pc.workerName || pc.closer || null
    if (!name) continue
    if (!byCloser[name]) byCloser[name] = { name, total: 0, originals: 0 }
    byCloser[name].total++
    if ((pc.caseStatus || '').toLowerCase() !== 'replacement') byCloser[name].originals++
  }
  const rows = Object.values(byCloser).sort((a, b) => b.total - a.total)
  if (rows.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-200">Closer Leaderboard</h3>
      </div>
      <div className="divide-y divide-gray-800/60">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-4 px-5 py-3">
            <span className="text-gray-600 text-xs w-4">{i + 1}</span>
            <span className="text-gray-200 font-medium text-sm flex-1">{r.name}</span>
            <span className="text-emerald-400 font-semibold tabular-nums">{r.total}</span>
            <span className="text-gray-500 text-xs">signed</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreativeName({ name }: { name?: string | null }) {
  const [show, setShow] = useState(false)
  if (!name) return <span className="text-gray-600 text-xs">—</span>
  return (
    <div className="relative inline-block w-full"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}>
      <p className="text-gray-400 text-xs truncate cursor-default">{name}</p>
      {show && (
        <div className="absolute z-50 left-0 top-full mt-1.5 w-max max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 shadow-xl pointer-events-none">
          {name}
        </div>
      )}
    </div>
  )
}

// Deterministic color per accident group (cycles through palette by group index)
const GROUP_PALETTE = [
  { border: '#3b82f6', bg: 'rgba(59,130,246,0.08)', badge: '#1d4ed8', text: '#93c5fd', label: 'blue' },
  { border: '#a855f7', bg: 'rgba(168,85,247,0.08)', badge: '#7e22ce', text: '#d8b4fe', label: 'purple' },
  { border: '#f97316', bg: 'rgba(249,115,22,0.08)', badge: '#c2410c', text: '#fed7aa', label: 'orange' },
  { border: '#14b8a6', bg: 'rgba(20,184,166,0.08)', badge: '#0f766e', text: '#99f6e4', label: 'teal' },
  { border: '#ec4899', bg: 'rgba(236,72,153,0.08)', badge: '#9d174d', text: '#fbcfe8', label: 'pink' },
]

export function PcTable({ pcs }: { pcs: any[] }) {
  const [localPcs, setLocalPcs] = useState<any[]>(pcs)
  const [linkMode, setLinkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [linking, setLinking] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingCloser, setEditingCloser] = useState<{ id: string; value: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setLocalPcs(pcs) }, [pcs])

  async function handleDeleteCase(pc: any) {
    if (confirmDeleteId !== pc.id) { setConfirmDeleteId(pc.id); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/metrics/case?id=${encodeURIComponent(pc.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setLocalPcs(prev => prev.filter(p => p.id !== pc.id))
      setConfirmDeleteId(null)
    } finally { setBusy(false) }
  }

  async function handleSaveCloser(pcId: string) {
    if (!editingCloser) return
    setBusy(true)
    try {
      const res = await fetch('/api/metrics/case', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pcId, closer: editingCloser.value }),
      })
      if (!res.ok) throw new Error('Update failed')
      setLocalPcs(prev => prev.map(p =>
        p.id === pcId ? { ...p, closer: editingCloser.value, workerName: editingCloser.value || p.workerName } : p
      ))
      setEditingCloser(null)
    } finally { setBusy(false) }
  }

  const originals = localPcs.filter(p => (p.caseStatus || 'e_signed').toLowerCase() !== 'replacement' && !p.excludedFromPayment)
  const minors = localPcs.filter(p => (p.caseStatus || 'e_signed').toLowerCase() !== 'replacement' && p.excludedFromPayment)
  const replacements = localPcs.filter(p => (p.caseStatus || '').toLowerCase() === 'replacement')

  // Build group → palette color mapping (stable: sorted by first occurrence)
  const groupOrder: string[] = []
  for (const pc of localPcs) {
    if (pc.accidentGroupId && !groupOrder.includes(pc.accidentGroupId)) {
      groupOrder.push(pc.accidentGroupId)
    }
  }
  function groupColor(groupId: string) {
    const idx = groupOrder.indexOf(groupId)
    return GROUP_PALETTE[idx % GROUP_PALETTE.length]
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleLink() {
    const ids = [...selected]
    if (ids.length < 2) return
    setLinking(true)
    const res = await fetch('/api/metrics/pc-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action: 'link' }),
    })
    const data = await res.json()
    if (data.groupId) {
      setLocalPcs(prev => prev.map(p => ids.includes(p.id) ? { ...p, accidentGroupId: data.groupId } : p))
    }
    setSelected(new Set())
    setLinkMode(false)
    setLinking(false)
  }

  async function handleUnlink(id: string) {
    await fetch('/api/metrics/pc-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], action: 'unlink' }),
    })
    setLocalPcs(prev => prev.map(p => p.id === id ? { ...p, accidentGroupId: null } : p))
  }

  const cols = linkMode
    ? ['', 'Client', 'Invoice', 'Status', 'Signed', 'Replacement Window', 'Creative', 'Closer']
    : ['Client', 'Invoice', 'Status', 'Signed', 'Replacement Window', 'Value', 'Creative', 'Closer', 'Accident', '']

  return (
    <div className="space-y-4">
      <CloserLeaderboard pcs={localPcs} />
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Summary + link mode toolbar */}
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-4">
            {localPcs.length > 0 && (
              <>
                <span className="text-gray-400">
                  <span className="text-white font-semibold">{localPcs.length}</span> total
                </span>
                <span className="text-gray-600">·</span>
                <span className="text-gray-400">
                  <span className="text-emerald-400 font-semibold">{originals.length}</span> original
                </span>
                {minors.length > 0 && (
                  <>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-400">
                      <span className="text-purple-400 font-semibold">{minors.length}</span> minor{minors.length !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
                {replacements.length > 0 && (
                  <>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-400">
                      <span className="text-amber-400 font-semibold">{replacements.length}</span> replacement{replacements.length !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {linkMode ? (
              <>
                <span className="text-xs text-gray-400">{selected.size} selected</span>
                <button
                  onClick={handleLink}
                  disabled={selected.size < 2 || linking}
                  className="text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition"
                >
                  {linking ? 'Linking...' : `Link ${selected.size} as Same Accident`}
                </button>
                <button
                  onClick={() => { setLinkMode(false); setSelected(new Set()) }}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5 transition"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setLinkMode(true)}
                className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Link Accident
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                {cols.map(col => (
                  <th key={col} className="text-gray-400 font-medium py-3 px-4 text-xs uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localPcs.map((pc: any) => {
                const isReplacement = (pc.caseStatus || '').toLowerCase() === 'replacement'
                const isSelected = selected.has(pc.id)
                const color = pc.accidentGroupId ? groupColor(pc.accidentGroupId) : null
                const groupNum = pc.accidentGroupId ? groupOrder.indexOf(pc.accidentGroupId) + 1 : null

                return (
                  <tr
                    key={pc.id}
                    onClick={linkMode ? () => toggleSelect(pc.id) : undefined}
                    className={`border-b border-gray-800/50 transition ${
                      linkMode ? 'cursor-pointer' : ''
                    } ${isReplacement && !isSelected ? 'bg-amber-950/10' : ''}
                    ${isSelected ? 'bg-blue-900/20' : 'hover:bg-gray-800/20'}`}
                    style={color ? { borderLeft: `3px solid ${color.border}` } : { borderLeft: '3px solid transparent' }}
                  >
                    {/* Checkbox column (link mode only) */}
                    {linkMode && (
                      <td className="py-3 px-3 w-8">
                        <input
                          type="checkbox"
                          readOnly
                          checked={isSelected}
                          className="w-4 h-4 accent-blue-500 pointer-events-none"
                        />
                      </td>
                    )}

                    {/* Client */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {isReplacement && (
                          <span className="text-[10px] bg-amber-900/50 text-amber-300 border border-amber-700/40 px-1.5 py-0.5 rounded font-semibold shrink-0">
                            REPL
                          </span>
                        )}
                        {pc.excludedFromPayment && (
                          <span className="text-[10px] bg-purple-900/50 text-purple-300 border border-purple-700/40 px-1.5 py-0.5 rounded font-semibold shrink-0">
                            EXTRA
                          </span>
                        )}
                        <div>
                          <div className="text-gray-200 font-medium">{pc.contactName || '—'}</div>
                          <div className="text-xs text-gray-500">{pc.contactPhone || pc.contactEmail || ''}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-gray-300">{pc.invoiceCode || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded ${statusBadgeClass(pc.caseStatus)}`}>
                        {(pc.caseStatus || 'e_signed').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs whitespace-nowrap">
                      {pc.qualifiedAt ? String(pc.qualifiedAt).split('T')[0] : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {isReplacement ? (
                        <span className="text-xs text-amber-400/70 italic">Replacement case</span>
                      ) : (
                        <>
                          <span className={`text-xs font-medium ${
                            pc.replacementNote === 'Window ended' ? 'text-red-400' :
                            pc.replacementDaysLeft != null && pc.replacementDaysLeft <= 3 ? 'text-amber-400' :
                            'text-gray-300'
                          }`}>
                            {pc.replacementNote}
                          </span>
                          {pc.replacementEnds && pc.replacementDaysLeft != null && (
                            <div className="text-[10px] text-gray-600">until {pc.replacementEnds}</div>
                          )}
                        </>
                      )}
                    </td>
                    {/* Value — only shown in normal mode (not link mode) */}
                    {!linkMode && (
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {pc.customCaseValue != null ? (
                          <span className="text-purple-300 font-semibold">${pc.customCaseValue.toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-3 px-4 max-w-[180px]">
                      <CreativeName name={pc.adName} />
                    </td>
                    {/* Closer — inline editable */}
                    <td className="py-3 px-4 text-xs">
                      {editingCloser?.id === pc.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 text-xs w-28 outline-none focus:border-blue-500"
                            value={editingCloser?.value ?? ''}
                            onChange={e => setEditingCloser({ id: pc.id, value: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveCloser(pc.id)
                              if (e.key === 'Escape') setEditingCloser(null)
                            }}
                          />
                          <button onClick={() => handleSaveCloser(pc.id)} disabled={busy}
                            className="text-green-400 hover:text-green-300 disabled:opacity-40 text-[10px] font-semibold">Save</button>
                          <button onClick={() => setEditingCloser(null)}
                            className="text-gray-500 hover:text-gray-300 text-[10px]">×</button>
                        </div>
                      ) : (
                        <button
                          onClick={linkMode ? undefined : () => setEditingCloser({ id: pc.id, value: pc.workerName || pc.closer || '' })}
                          className={`group flex items-center gap-1 text-gray-400 transition ${!linkMode ? 'hover:text-gray-200 cursor-pointer' : 'cursor-default'}`}
                        >
                          <span>{pc.workerName || pc.closer || <span className="text-gray-600 italic">Add closer</span>}</span>
                          {!linkMode && (
                            <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </td>
                    {/* Accident group column (normal mode only) */}
                    {!linkMode && (
                      <td className="py-3 px-4">
                        {color && groupNum ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}40` }}
                            >
                              Group {groupNum}
                            </span>
                            <button
                              onClick={() => handleUnlink(pc.id)}
                              title="Remove from accident group"
                              className="text-gray-600 hover:text-red-400 transition text-xs leading-none"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                    )}
                    {/* Delete column (normal mode only) */}
                    {!linkMode && (
                      <td className="py-3 px-3 text-right">
                        {confirmDeleteId === pc.id ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[10px] text-red-400">Delete?</span>
                            <button onClick={() => handleDeleteCase(pc)} disabled={busy}
                              className="text-[10px] font-semibold text-red-400 hover:text-red-300 disabled:opacity-40">Yes</button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              className="text-[10px] text-gray-500 hover:text-gray-300">No</button>
                          </div>
                        ) : (
                          <button onClick={() => handleDeleteCase(pc)}
                            className="text-gray-700 hover:text-red-400 transition p-1 rounded"
                            title="Delete case">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {localPcs.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="py-12 px-4 text-center text-gray-500">
                    No signed PCs for this invoice yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
