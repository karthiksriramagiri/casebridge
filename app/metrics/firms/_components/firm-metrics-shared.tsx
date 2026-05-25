'use client'

import { useEffect, useState } from 'react'

const BG = '#EDE8DF'
const CARD = '#FFFFFF'
const BORDER = '#D9D3C8'
const TEXT = '#1A1A1A'
const MUTED = '#6B6560'
const ACCENT = '#C17A4A'

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
  const valColor =
    highlight === 'green' ? '#15803D' :
    highlight === 'red' ? '#B91C1C' :
    highlight === 'yellow' ? '#92400E' :
    highlight === 'blue' ? ACCENT :
    TEXT
  const borderColor =
    highlight === 'green' ? '#BBF7D0' :
    highlight === 'red' ? '#FECACA' :
    highlight === 'yellow' ? '#FDE68A' :
    highlight === 'blue' ? '#FED7AA' :
    BORDER
  return (
    <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${borderColor}` }}>
      <p className="text-xs uppercase tracking-widest mb-1.5 font-medium" style={{ color: MUTED }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: valColor }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: MUTED }}>{sub}</p>}
    </div>
  )
}

export function PhaseBadge({ label, color }: { label: string; color: string }) {
  const s =
    color === 'blue' ? { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' } :
    color === 'purple' ? { bg: '#FAF5FF', text: '#7E22CE', border: '#E9D5FF' } :
    { bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}>
      {label.toUpperCase()} PHASE
    </span>
  )
}

export function statusBadgeClass(status: string): string {
  // Returns a CSS class string — but we'll return a consistent neutral for light theme
  const s = (status || '').toLowerCase()
  if (s === 'closed') return '_closed'
  if (s === 'replacement') return '_replacement'
  if (s === 'e_signed') return '_esigned'
  return '_default'
}

/** Renders a status badge with inline styles for light theme */
export function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  const style =
    s === 'closed' ? { background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' } :
    s === 'replacement' ? { background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' } :
    s === 'e_signed' ? { background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' } :
    { background: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB' }
  return (
    <span className="text-xs px-2 py-0.5 rounded font-medium" style={style}>
      {(status || 'e_signed').replace(/_/g, ' ')}
    </span>
  )
}

export function InsightsPanel({ data, loading, onGenerate }: {
  data: any | null
  loading: boolean
  onGenerate: () => void
}) {
  const borderColor =
    data?.status === 'critical' ? '#FECACA' :
    data?.status === 'warning' ? '#FDE68A' :
    data?.status === 'good' ? '#BBF7D0' :
    BORDER
  const bgColor =
    data?.status === 'critical' ? '#FFF5F5' :
    data?.status === 'warning' ? '#FFFDF0' :
    data?.status === 'good' ? '#F0FDF4' :
    CARD

  return (
    <div className="rounded-xl p-6" style={{ background: bgColor, border: `1px solid ${borderColor}` }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: TEXT }}>AI Insights</h2>
        <button onClick={onGenerate} disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          style={{ background: '#F5F0E8', color: MUTED, border: `1px solid ${BORDER}` }}>
          {loading ? 'Analyzing...' : data ? 'Refresh' : 'Generate Insights'}
        </button>
      </div>

      {loading && <div className="text-sm animate-pulse" style={{ color: MUTED }}>Analyzing your data...</div>}

      {!loading && !data && (
        <p className="text-sm" style={{ color: MUTED }}>Click &quot;Generate Insights&quot; to get an AI-powered diagnosis of your business performance.</p>
      )}

      {!loading && data && (
        <div className="space-y-4">
          <p className="font-medium" style={{ color: TEXT }}>{data.headline}</p>

          {data.findings?.length > 0 && (
            <div className="space-y-3">
              {data.findings.map((f: any, i: number) => (
                <div key={i} className="rounded-lg p-4" style={{ background: '#F5F0E8', border: `1px solid ${BORDER}` }}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider mt-0.5 shrink-0 w-20" style={{ color: MUTED }}>{f.area}</span>
                    <div>
                      <p className="text-sm" style={{ color: TEXT }}>{f.finding}</p>
                      <p className="text-xs mt-1.5" style={{ color: ACCENT }}>→ {f.action}</p>
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
                const s = isGood ? { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' } :
                  isBad ? { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' } :
                  { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' }
                return (
                  <span key={b.label} className="text-xs px-2 py-1 rounded-md border"
                    style={{ background: s.bg, color: s.color, borderColor: s.border }}>
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

export function ExpensesPanel({ firmId, invoiceCode }: { firmId: string; invoiceCode?: string | null }) {
  const [expenses, setExpenses] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], amount: '', description: '', category: 'other', shared: false, tagInvoice: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !firmId) return
    const q = invoiceCode ? `firm_id=${firmId}&invoice_code=${encodeURIComponent(invoiceCode)}` : `firm_id=${firmId}`
    fetch(`/api/metrics/expenses?${q}`).then(r => r.json()).then(d => setExpenses(d.expenses || []))
  }, [open, firmId, invoiceCode])

  async function addExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || !form.date) return
    setSaving(true)
    const res = await fetch('/api/metrics/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firm_id: form.shared ? null : firmId, date: form.date, amount: form.amount, description: form.description, category: form.category, invoice_code: invoiceCode && form.tagInvoice ? invoiceCode : null }) })
    const data = await res.json()
    if (data.expense) setExpenses(prev => [data.expense, ...prev])
    setForm(f => ({ ...f, amount: '', description: '' }))
    setSaving(false)
  }

  async function deleteExpense(id: string) {
    await fetch(`/api/metrics/expenses?id=${id}`, { method: 'DELETE' })
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  const inputStyle = { background: '#F5F0E8', border: `1px solid ${BORDER}`, color: TEXT }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 transition hover:bg-black/[0.02]">
        <span className="text-sm font-medium" style={{ color: TEXT }}>
          Ops expenses{invoiceCode && <span className="font-normal ml-2" style={{ color: MUTED }}>({invoiceCode})</span>}
        </span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: MUTED }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="p-5 space-y-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          {invoiceCode && <p className="text-xs" style={{ color: MUTED }}>Rows dated inside this invoice window count automatically; you can also tag lines explicitly to {invoiceCode}.</p>}
          <form onSubmit={addExpense} className="flex flex-wrap gap-2 items-end">
            {[
              { label: 'Date', type: 'date', val: form.date, onChange: (v: string) => setForm(f => ({ ...f, date: v })), cls: '' },
              { label: 'Amount ($)', type: 'number', val: form.amount, onChange: (v: string) => setForm(f => ({ ...f, amount: v })), cls: 'w-28', placeholder: '0' },
              { label: 'Description', type: 'text', val: form.description, onChange: (v: string) => setForm(f => ({ ...f, description: v })), cls: 'w-48', placeholder: 'e.g. Slack' },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs mb-1" style={{ color: MUTED }}>{f.label}</label>
                <input type={f.type} value={f.val} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                  className={`text-sm rounded-lg px-3 py-1.5 focus:outline-none ${f.cls}`} style={inputStyle} />
              </div>
            ))}
            <div>
              <label className="block text-xs mb-1" style={{ color: MUTED }}>Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="text-sm rounded-lg px-3 py-1.5 focus:outline-none" style={inputStyle}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 pb-1">
              <input type="checkbox" checked={form.shared} onChange={e => setForm(f => ({ ...f, shared: e.target.checked }))} className="w-4 h-4" style={{ accentColor: ACCENT }} />
              <label className="text-xs" style={{ color: MUTED }}>Shared</label>
            </div>
            {invoiceCode && (
              <div className="flex items-center gap-1.5 pb-1">
                <input type="checkbox" checked={form.tagInvoice} onChange={e => setForm(f => ({ ...f, tagInvoice: e.target.checked }))} className="w-4 h-4" style={{ accentColor: ACCENT }} />
                <label className="text-xs" style={{ color: MUTED }}>Tag {invoiceCode}</label>
              </div>
            )}
            <button type="submit" disabled={saving}
              className="text-sm px-4 py-1.5 rounded-lg transition disabled:opacity-50"
              style={{ background: TEXT, color: '#FFF' }}>
              {saving ? '...' : 'Add'}
            </button>
          </form>

          {expenses.length > 0 ? (
            <div className="space-y-0">
              {expenses.map(exp => (
                <div key={exp.id} className="flex items-center justify-between text-sm py-2.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs w-24" style={{ color: MUTED }}>{exp.date}</span>
                    <span style={{ color: TEXT }}>{exp.description || '—'}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#F5F0E8', color: MUTED }}>{exp.category}</span>
                    {exp.invoice_code && <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#FFF7ED', color: ACCENT }}>{exp.invoice_code}</span>}
                    {!exp.firm_id && <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#FFFBEB', color: '#92400E' }}>shared</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-medium" style={{ color: TEXT }}>${Number(exp.amount).toLocaleString()}</span>
                    <button type="button" onClick={() => deleteExpense(exp.id)} className="transition text-xs" style={{ color: '#D1D5DB' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#B91C1C')} onMouseLeave={e => (e.currentTarget.style.color = '#D1D5DB')}>×</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: MUTED }}>No expenses in this bucket yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

function CloserLeaderboard({ pcs }: { pcs: any[] }) {
  const originals = pcs.filter(p => (p.caseStatus || '').toLowerCase() !== 'replacement')
  const byCloser: Record<string, { name: string; total: number }> = {}
  for (const pc of originals) {
    const name = pc.workerName || pc.closer || null
    if (!name) continue
    if (!byCloser[name]) byCloser[name] = { name, total: 0 }
    byCloser[name].total++
  }
  const rows = Object.values(byCloser).sort((a, b) => b.total - a.total)
  if (rows.length === 0) return null

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Closer Leaderboard</h3>
      </div>
      <div>
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-4 px-5 py-3" style={{ borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
            <span className="text-xs w-4" style={{ color: MUTED }}>{i + 1}</span>
            <span className="font-medium text-sm flex-1" style={{ color: TEXT }}>{r.name}</span>
            <span className="font-semibold tabular-nums" style={{ color: '#15803D' }}>{r.total}</span>
            <span className="text-xs" style={{ color: MUTED }}>signed</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreativeName({ name }: { name?: string | null }) {
  const [show, setShow] = useState(false)
  if (!name) return <span className="text-xs" style={{ color: '#D1D5DB' }}>—</span>
  return (
    <div className="relative inline-block w-full" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <p className="text-xs truncate cursor-default" style={{ color: MUTED }}>{name}</p>
      {show && (
        <div className="absolute z-50 left-0 top-full mt-1.5 w-max max-w-xs rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none"
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT }}>
          {name}
        </div>
      )}
    </div>
  )
}

const GROUP_PALETTE = [
  { border: '#3b82f6', bg: 'rgba(59,130,246,0.08)', text: '#1D4ED8' },
  { border: '#a855f7', bg: 'rgba(168,85,247,0.08)', text: '#7E22CE' },
  { border: '#f97316', bg: 'rgba(249,115,22,0.08)', text: '#C2410C' },
  { border: '#14b8a6', bg: 'rgba(20,184,166,0.08)', text: '#0F766E' },
  { border: '#ec4899', bg: 'rgba(236,72,153,0.08)', text: '#9D174D' },
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
      const res = await fetch('/api/metrics/case', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pcId, closer: editingCloser.value }) })
      if (!res.ok) throw new Error('Update failed')
      setLocalPcs(prev => prev.map(p => p.id === pcId ? { ...p, closer: editingCloser.value, workerName: editingCloser.value || p.workerName } : p))
      setEditingCloser(null)
    } finally { setBusy(false) }
  }

  const originals = localPcs.filter(p => (p.caseStatus || 'e_signed').toLowerCase() !== 'replacement' && !p.excludedFromPayment)
  const minors = localPcs.filter(p => (p.caseStatus || 'e_signed').toLowerCase() !== 'replacement' && p.excludedFromPayment)
  const replacements = localPcs.filter(p => (p.caseStatus || '').toLowerCase() === 'replacement')

  const groupOrder: string[] = []
  for (const pc of localPcs) {
    if (pc.accidentGroupId && !groupOrder.includes(pc.accidentGroupId)) groupOrder.push(pc.accidentGroupId)
  }
  function groupColor(groupId: string) {
    return GROUP_PALETTE[groupOrder.indexOf(groupId) % GROUP_PALETTE.length]
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  async function handleLink() {
    const ids = [...selected]
    if (ids.length < 2) return
    setLinking(true)
    const res = await fetch('/api/metrics/pc-group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, action: 'link' }) })
    const data = await res.json()
    if (data.groupId) setLocalPcs(prev => prev.map(p => ids.includes(p.id) ? { ...p, accidentGroupId: data.groupId } : p))
    setSelected(new Set()); setLinkMode(false); setLinking(false)
  }

  async function handleUnlink(id: string) {
    await fetch('/api/metrics/pc-group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], action: 'unlink' }) })
    setLocalPcs(prev => prev.map(p => p.id === id ? { ...p, accidentGroupId: null } : p))
  }

  const cols = linkMode
    ? ['', 'Client', 'Invoice', 'Status', 'Signed', 'Replacement Window', 'Creative', 'Closer']
    : ['Client', 'Invoice', 'Status', 'Signed', 'Replacement Window', 'Value', 'Creative', 'Closer', 'Accident', '']

  const thCls = "text-left text-xs font-semibold py-3 px-4 uppercase tracking-wider whitespace-nowrap"

  return (
    <div className="space-y-4">
      <CloserLeaderboard pcs={localPcs} />
      <div className="rounded-xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        {/* Toolbar */}
        <div className="px-5 py-3 flex items-center justify-between gap-4 text-sm flex-wrap" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-4">
            {localPcs.length > 0 && (
              <>
                <span style={{ color: MUTED }}><span className="font-semibold" style={{ color: TEXT }}>{localPcs.length}</span> total</span>
                <span style={{ color: '#D1D5DB' }}>·</span>
                <span style={{ color: MUTED }}><span className="font-semibold" style={{ color: '#15803D' }}>{originals.length}</span> original</span>
                {minors.length > 0 && (<><span style={{ color: '#D1D5DB' }}>·</span><span style={{ color: MUTED }}><span className="font-semibold" style={{ color: '#7E22CE' }}>{minors.length}</span> minor{minors.length !== 1 ? 's' : ''}</span></>)}
                {replacements.length > 0 && (<><span style={{ color: '#D1D5DB' }}>·</span><span style={{ color: MUTED }}><span className="font-semibold" style={{ color: '#92400E' }}>{replacements.length}</span> replacement{replacements.length !== 1 ? 's' : ''}</span></>)}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {linkMode ? (
              <>
                <span className="text-xs" style={{ color: MUTED }}>{selected.size} selected</span>
                <button onClick={handleLink} disabled={selected.size < 2 || linking}
                  className="text-xs px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                  style={{ background: TEXT, color: '#FFF' }}>
                  {linking ? 'Linking...' : `Link ${selected.size} as Same Accident`}
                </button>
                <button onClick={() => { setLinkMode(false); setSelected(new Set()) }}
                  className="text-xs px-2 py-1.5 transition" style={{ color: MUTED }}>Cancel</button>
              </>
            ) : (
              <button onClick={() => setLinkMode(true)}
                className="text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                style={{ background: '#F5F0E8', color: MUTED, border: `1px solid ${BORDER}` }}>
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
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {cols.map(col => (
                  <th key={col} className={thCls} style={{ color: MUTED }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localPcs.map((pc: any) => {
                const isReplacement = (pc.caseStatus || '').toLowerCase() === 'replacement'
                const isSelected = selected.has(pc.id)
                const color = pc.accidentGroupId ? groupColor(pc.accidentGroupId) : null
                const groupNum = pc.accidentGroupId ? groupOrder.indexOf(pc.accidentGroupId) + 1 : null
                const rowBg = isSelected ? '#EFF6FF' : isReplacement ? '#FFFBEB' : 'transparent'

                return (
                  <tr key={pc.id}
                    onClick={linkMode ? () => toggleSelect(pc.id) : undefined}
                    className={`transition ${linkMode ? 'cursor-pointer' : ''}`}
                    style={{ borderBottom: `1px solid ${BORDER}`, background: rowBg, borderLeft: color ? `3px solid ${color.border}` : '3px solid transparent' }}>
                    {linkMode && (
                      <td className="py-3 px-3 w-8">
                        <input type="checkbox" readOnly checked={isSelected} className="w-4 h-4 pointer-events-none" style={{ accentColor: ACCENT }} />
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {isReplacement && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0"
                            style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>REPL</span>
                        )}
                        {pc.excludedFromPayment && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0"
                            style={{ background: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>EXTRA</span>
                        )}
                        <div>
                          <div className="font-medium" style={{ color: TEXT }}>{pc.contactName || '—'}</div>
                          <div className="text-xs" style={{ color: MUTED }}>{pc.contactPhone || pc.contactEmail || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4" style={{ color: TEXT }}>{pc.invoiceCode || '—'}</td>
                    <td className="py-3 px-4"><StatusBadge status={pc.caseStatus} /></td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap" style={{ color: MUTED }}>
                      {pc.qualifiedAt ? String(pc.qualifiedAt).split('T')[0] : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {isReplacement ? (
                        <span className="text-xs italic" style={{ color: '#92400E' }}>Replacement case</span>
                      ) : (
                        <>
                          <span className="text-xs font-medium" style={{
                            color: pc.replacementNote === 'Window ended' ? '#B91C1C' :
                              pc.replacementDaysLeft != null && pc.replacementDaysLeft <= 3 ? '#92400E' : TEXT
                          }}>{pc.replacementNote}</span>
                          {pc.replacementEnds && pc.replacementDaysLeft != null && (
                            <div className="text-[10px]" style={{ color: MUTED }}>until {pc.replacementEnds}</div>
                          )}
                        </>
                      )}
                    </td>
                    {!linkMode && (
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {pc.customCaseValue != null ? (
                          <span className="font-semibold" style={{ color: '#7E22CE' }}>${pc.customCaseValue.toLocaleString()}</span>
                        ) : <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                    )}
                    <td className="py-3 px-4 max-w-[180px]"><CreativeName name={pc.adName} /></td>
                    <td className="py-3 px-4 text-xs">
                      {editingCloser?.id === pc.id ? (
                        <div className="flex items-center gap-1.5">
                          <input autoFocus
                            className="text-xs w-28 px-2 py-1 rounded outline-none"
                            style={{ background: '#F5F0E8', border: `1px solid ${ACCENT}`, color: TEXT }}
                            value={editingCloser?.value ?? ''}
                            onChange={e => setEditingCloser({ id: pc.id, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveCloser(pc.id); if (e.key === 'Escape') setEditingCloser(null) }} />
                          <button onClick={() => handleSaveCloser(pc.id)} disabled={busy}
                            className="text-[10px] font-semibold disabled:opacity-40" style={{ color: '#15803D' }}>Save</button>
                          <button onClick={() => setEditingCloser(null)} className="text-[10px]" style={{ color: MUTED }}>×</button>
                        </div>
                      ) : (
                        <button onClick={linkMode ? undefined : () => setEditingCloser({ id: pc.id, value: pc.workerName || pc.closer || '' })}
                          className={`group flex items-center gap-1 transition ${!linkMode ? 'cursor-pointer' : 'cursor-default'}`}
                          style={{ color: MUTED }}>
                          <span>{pc.workerName || pc.closer || <span className="italic" style={{ color: '#D1D5DB' }}>Add closer</span>}</span>
                          {!linkMode && (
                            <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </td>
                    {!linkMode && (
                      <td className="py-3 px-4">
                        {color && groupNum ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}40` }}>
                              Group {groupNum}
                            </span>
                            <button onClick={() => handleUnlink(pc.id)} title="Remove from accident group"
                              className="transition text-xs leading-none" style={{ color: '#D1D5DB' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#B91C1C')} onMouseLeave={e => (e.currentTarget.style.color = '#D1D5DB')}>×</button>
                          </div>
                        ) : <span className="text-xs" style={{ color: '#E5E7EB' }}>—</span>}
                      </td>
                    )}
                    {!linkMode && (
                      <td className="py-3 px-3 text-right">
                        {confirmDeleteId === pc.id ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[10px]" style={{ color: '#B91C1C' }}>Delete?</span>
                            <button onClick={() => handleDeleteCase(pc)} disabled={busy}
                              className="text-[10px] font-semibold disabled:opacity-40" style={{ color: '#B91C1C' }}>Yes</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-[10px]" style={{ color: MUTED }}>No</button>
                          </div>
                        ) : (
                          <button onClick={() => handleDeleteCase(pc)}
                            className="transition p-1 rounded" style={{ color: '#D1D5DB' }} title="Delete case"
                            onMouseEnter={e => (e.currentTarget.style.color = '#B91C1C')} onMouseLeave={e => (e.currentTarget.style.color = '#D1D5DB')}>
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
                  <td colSpan={cols.length} className="py-12 px-4 text-center text-sm" style={{ color: MUTED }}>
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
