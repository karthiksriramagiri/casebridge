'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  money,
  Leaderboard, InlineEdit, ConfirmAction, EmptyState, Banner,
  IconPlus, IconTrash, IconLink, IconCopy, IconCheck, IconRoute, IconCaret,
  IconSpark, IconArrow,
} from '@/app/_metrics/dash'

/* ═══════════════════════════════════════════════════════════════════════════
   Shared surfaces for firm + invoice pages.
   Export signatures are unchanged from the previous version so every consuming
   page keeps working; the implementations are rebuilt on the metrics design
   system (app/metrics/metrics.css).
   ═══════════════════════════════════════════════════════════════════════════ */

export const DATE_PRESETS = [
  { label: 'Today', value: 'today' },
  { label: '7d', value: 'last_7d' },
  { label: '14d', value: 'last_14d' },
  { label: '30d', value: 'last_30d' },
  { label: 'All time', value: 'maximum' },
]

export function fmt$(n: number | null | undefined) {
  return money(n)
}

export function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toFixed(1) + '%'
}

/* ── KPI card ───────────────────────────────────────────────────────────── */

export function KPICard({
  label, value, sub, highlight,
}: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | 'yellow' | 'blue' }) {
  const color =
    highlight === 'green' ? 'var(--mx-good)' :
    highlight === 'red' ? 'var(--mx-crit)' :
    highlight === 'yellow' ? 'var(--mx-warn)' :
    highlight === 'blue' ? 'var(--mx-accent)' :
    'var(--mx-ink)'
  const empty = value === '—'
  return (
    <div className="mx-card" style={{ padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p className="mx-strip-label">{label}</p>
      <p style={{
        fontSize: 23, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1,
        color: empty ? 'var(--mx-faint)' : color,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--mx-muted)', lineHeight: 1.4, marginTop: 'auto' }}>{sub}</p>}
    </div>
  )
}

/* ── Phase badge ────────────────────────────────────────────────────────── */

export function PhaseBadge({ label, color }: { label: string; color: string }) {
  // The API's "color" names a phase, not a hue. Map it onto the reserved ramp
  // so a phase can never be mistaken for a performance status.
  const tone =
    color === 'purple' ? { bg: 'var(--mx-accent-soft)', fg: 'var(--mx-accent-ink)' } :
    color === 'blue' ? { bg: 'var(--mx-surface-3)', fg: 'var(--mx-ink-2)' } :
    { bg: 'var(--mx-idle-soft)', fg: 'var(--mx-idle)' }
  return (
    <span className="mx-pill" style={{ background: tone.bg, color: tone.fg }}>
      <span className="mx-pill-dot" />
      {label} phase
    </span>
  )
}

/* ── Case status ────────────────────────────────────────────────────────── */

export function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase()
  if (s === 'closed') return '_closed'
  if (s === 'replacement') return '_replacement'
  if (s === 'e_signed') return '_esigned'
  return '_default'
}

const CASE_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  closed:      { label: 'Closed',      bg: 'var(--mx-good-soft)',  fg: 'var(--mx-good)' },
  e_signed:    { label: 'E-signed',    bg: 'var(--mx-surface-3)',  fg: 'var(--mx-ink-2)' },
  replacement: { label: 'Replacement', bg: 'var(--mx-warn-soft)',  fg: 'var(--mx-warn)' },
  mia:         { label: 'MIA',         bg: 'var(--mx-idle-soft)',  fg: 'var(--mx-idle)' },
}

export function StatusBadge({ status }: { status: string }) {
  const key = (status || 'e_signed').toLowerCase()
  const s = CASE_STATUS[key] || { label: key.replace(/_/g, ' '), bg: 'var(--mx-surface-3)', fg: 'var(--mx-muted)' }
  return <span className="mx-chip" style={{ background: s.bg, color: s.fg, fontSize: 10.5 }}>{s.label}</span>
}

/* ── AI insights ────────────────────────────────────────────────────────── */

const ASSESS_GOOD = ['good', 'healthy', 'efficient']
const ASSESS_BAD = ['very_high', 'negative', 'wasteful', 'critical']

export function InsightsPanel({ data, loading, onGenerate }: {
  data: any | null
  loading: boolean
  onGenerate: () => void
}) {
  const tone =
    data?.status === 'critical' ? 'crit' :
    data?.status === 'warning' ? 'warn' :
    data?.status === 'good' ? 'good' : null

  const accent =
    tone === 'crit' ? 'var(--mx-crit)' :
    tone === 'warn' ? 'var(--mx-warn)' :
    tone === 'good' ? 'var(--mx-good)' : 'var(--mx-line)'

  return (
    <section className="mx-card" style={{ borderColor: tone ? accent : undefined, overflow: 'hidden' }}>
      <div className="mx-card-head">
        <span className="mx-card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <IconSpark style={{ color: 'var(--mx-accent)' }} />
          Diagnosis
        </span>
        <button className="mx-btn mx-btn-quiet" onClick={onGenerate} disabled={loading}>
          {loading ? 'Reading the numbers…' : data ? 'Run again' : 'Analyse this invoice'}
        </button>
      </div>

      {loading && (
        <div style={{ padding: '18px 20px', display: 'grid', gap: 9 }}>
          <div className="mx-skel" style={{ height: 13, width: '62%' }} />
          <div className="mx-skel" style={{ height: 11, width: '88%' }} />
          <div className="mx-skel" style={{ height: 11, width: '74%' }} />
        </div>
      )}

      {!loading && !data && (
        <EmptyState compact
          title="No diagnosis yet"
          text="Run the analysis to get a written read on spend efficiency, margin and what to change."
        />
      )}

      {!loading && data && (
        <>
          <p style={{ padding: '15px 20px 14px', fontSize: 14, fontWeight: 600, lineHeight: 1.45, color: 'var(--mx-ink)', borderBottom: data.findings?.length ? '1px solid var(--mx-line-2)' : undefined }}>
            {data.headline}
          </p>

          {data.findings?.length > 0 && (
            <div>
              {data.findings.map((f: any, i: number) => (
                <div className="mx-finding" key={i}>
                  <span className="mx-finding-area">{f.area}</span>
                  <div>
                    <p className="mx-finding-text">{f.finding}</p>
                    {f.action && (
                      <p className="mx-finding-action"><IconArrow size={13} style={{ marginTop: 2 }} />{f.action}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.benchmarks && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--mx-line-2)', display: 'flex', gap: 8, flexWrap: 'wrap', background: 'var(--mx-surface-2)' }}>
              {[
                { label: 'CPA', value: data.benchmarks.cpa_assessment },
                { label: 'Margin', value: data.benchmarks.margin_assessment },
                { label: 'Spend', value: data.benchmarks.spend_efficiency },
              ].filter(b => b.value).map(b => {
                const good = ASSESS_GOOD.includes(b.value)
                const bad = ASSESS_BAD.includes(b.value)
                return (
                  <span className={`mx-pill ${good ? 't-scale' : bad ? 't-kill' : 't-watch'}`} key={b.label}>
                    <span className="mx-pill-dot" />
                    {b.label}: {String(b.value).replace(/_/g, ' ')}
                  </span>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/* ── Ops expenses ───────────────────────────────────────────────────────── */

const EXPENSE_CATEGORIES = ['software', 'salary', 'office', 'marketing', 'legal', 'other']

export function ExpensesPanel({ firmId, invoiceCode }: { firmId: string; invoiceCode?: string | null }) {
  const [expenses, setExpenses] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '', description: '', category: 'other', shared: false, tagInvoice: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !firmId) return
    const q = invoiceCode ? `firm_id=${firmId}&invoice_code=${encodeURIComponent(invoiceCode)}` : `firm_id=${firmId}`
    fetch(`/api/metrics/expenses?${q}`).then(r => r.json()).then(d => setExpenses(d.expenses || [])).catch(() => {})
  }, [open, firmId, invoiceCode])

  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)

  async function addExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || !form.date) { setError('A date and an amount are both required.'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/metrics/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firm_id: form.shared ? null : firmId,
          date: form.date, amount: form.amount,
          description: form.description, category: form.category,
          invoice_code: invoiceCode && form.tagInvoice ? invoiceCode : null,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      if (data.expense) setExpenses(prev => [data.expense, ...prev])
      setForm(f => ({ ...f, amount: '', description: '' }))
    } catch {
      setError('Connection failed. Please try again.')
    } finally { setSaving(false) }
  }

  async function deleteExpense(id: string) {
    await fetch(`/api/metrics/expenses?id=${id}`, { method: 'DELETE' })
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  return (
    <section className="mx-card" style={{ overflow: 'hidden' }}>
      <button
        className="mx-card-head"
        style={{ width: '100%', background: 'none', border: 0, borderBottom: open ? '1px solid var(--mx-line-2)' : 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <span className="mx-card-title">
          Ops expenses
          {invoiceCode && <span style={{ fontWeight: 400, color: 'var(--mx-muted)', marginLeft: 8 }}>{invoiceCode}</span>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          {open && expenses.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--mx-muted)' }}>
              <b style={{ color: 'var(--mx-ink)', fontVariantNumeric: 'tabular-nums' }}>{money(total)}</b> across {expenses.length}
            </span>
          )}
          <IconCaret style={{ color: 'var(--mx-muted)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 200ms ease' }} />
        </span>
      </button>

      {open && (
        <>
          <form onSubmit={addExpense}
            style={{ padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', borderBottom: '1px solid var(--mx-line-2)', background: 'var(--mx-surface-2)' }}>
            <div className="mx-field" style={{ width: 138 }}>
              <label className="mx-label" htmlFor="exp-date">Date</label>
              <input id="exp-date" className="mx-input" type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="mx-field" style={{ width: 104 }}>
              <label className="mx-label" htmlFor="exp-amt">Amount</label>
              <input id="exp-amt" className="mx-input" type="number" value={form.amount} placeholder="0"
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="mx-field" style={{ flex: '1 1 190px', minWidth: 160 }}>
              <label className="mx-label" htmlFor="exp-desc">Description</label>
              <input id="exp-desc" className="mx-input" value={form.description} placeholder="Slack seats"
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="mx-field" style={{ width: 128 }}>
              <label className="mx-label" htmlFor="exp-cat">Category</label>
              <select id="exp-cat" className="mx-select" style={{ width: '100%' }} value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mx-ink-2)', paddingBottom: 9, cursor: 'pointer' }}>
              <input type="checkbox" className="mx-check" checked={form.shared}
                onChange={e => setForm(f => ({ ...f, shared: e.target.checked }))} />
              Shared
            </label>
            {invoiceCode && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mx-ink-2)', paddingBottom: 9, cursor: 'pointer' }}>
                <input type="checkbox" className="mx-check" checked={form.tagInvoice}
                  onChange={e => setForm(f => ({ ...f, tagInvoice: e.target.checked }))} />
                Tag {invoiceCode}
              </label>
            )}
            <button type="submit" className="mx-btn mx-btn-primary" disabled={saving} style={{ marginBottom: 1 }}>
              <IconPlus /> {saving ? 'Adding…' : 'Add'}
            </button>
          </form>

          {error && <div style={{ padding: '10px 20px' }}><Banner tone="crit">{error}</Banner></div>}

          {invoiceCode && (
            <p style={{ padding: '9px 20px 0', fontSize: 11.5, color: 'var(--mx-muted)', lineHeight: 1.5 }}>
              Rows dated inside this invoice window count automatically. Tagging pins a line to {invoiceCode} regardless of its date.
            </p>
          )}

          {expenses.length === 0 ? (
            <EmptyState compact title="No expenses here yet" text="Add the first line above and it will roll into this invoice's P&L." />
          ) : (
            <div className="mx-tw">
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Tags</th>
                    <th className="num">Amount</th>
                    <th style={{ width: 34 }} />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(exp => (
                    <tr className="row" key={exp.id}>
                      <td style={{ color: 'var(--mx-muted)', whiteSpace: 'nowrap' }}>{exp.date}</td>
                      <td style={{ fontWeight: 500 }}>{exp.description || <span className="mx-dim">—</span>}</td>
                      <td><span className="mx-chip" style={{ fontSize: 10.5 }}>{exp.category}</span></td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
                          {exp.invoice_code && (
                            <span className="mx-chip" style={{ fontSize: 10.5, background: 'var(--mx-accent-soft)', color: 'var(--mx-accent-ink)' }}>{exp.invoice_code}</span>
                          )}
                          {!exp.firm_id && (
                            <span className="mx-chip" style={{ fontSize: 10.5, background: 'var(--mx-warn-soft)', color: 'var(--mx-warn)' }}>shared</span>
                          )}
                        </span>
                      </td>
                      <td className="num" style={{ fontWeight: 650 }}>{money(Number(exp.amount))}</td>
                      <td>
                        <button className="mx-rowact danger" onClick={() => deleteExpense(exp.id)} title="Delete this line">
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="lbl">Total</td>
                    <td colSpan={3} />
                    <td className="num">{money(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/* ── PC table helpers ───────────────────────────────────────────────────── */

function formatPhone(raw: string | null | undefined) {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return raw
}

function pcRowText(pc: any) {
  const dol = pc.incidentDate ? String(pc.incidentDate).split('T')[0] : ''
  return [pc.contactName || '', formatPhone(pc.contactPhone), pc.contactEmail || '', dol].join('\t')
}

function CopyRowButton({ pc, selected, onToggle }: { pc: any; selected: boolean; onToggle: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  function handleClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey) { onToggle(pc.id); return }
    navigator.clipboard.writeText(pcRowText(pc)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      className={`mx-rowact ${selected ? 'is-picked' : copied ? 'is-on' : ''}`}
      onClick={handleClick}
      title={selected ? 'Selected — ⌘-click to deselect' : 'Copy name, phone, email and date of loss. ⌘-click to add to a multi-row copy.'}>
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  )
}

/* Five fixed hues for accident groups, assigned by the order groups appear.
   Every tag also carries its group number, so the color is never the only
   thing distinguishing one group from another. */
const GROUP_TONES = [
  { bg: 'var(--mx-accent-soft)', fg: 'var(--mx-accent-ink)', edge: 'var(--mx-accent)' },
  { bg: 'var(--mx-good-soft)',   fg: 'var(--mx-good)',       edge: 'var(--mx-good)' },
  { bg: 'var(--mx-warn-soft)',   fg: 'var(--mx-warn)',       edge: 'var(--mx-warn)' },
  { bg: 'var(--mx-crit-soft)',   fg: 'var(--mx-crit)',       edge: 'var(--mx-crit)' },
  { bg: 'var(--mx-idle-soft)',   fg: 'var(--mx-idle)',       edge: 'var(--mx-idle)' },
]

type Mode = 'none' | 'link' | 'route'

export function PcTable({ pcs, firmSlug }: { pcs: any[]; firmSlug?: string }) {
  const [rows, setRows] = useState<any[]>(pcs)
  const [mode, setMode] = useState<Mode>('none')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [copyPending, setCopyPending] = useState<string[]>([])
  const [copyDone, setCopyDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [working, setWorking] = useState(false)
  const [done, setDone] = useState(false)

  const [routeTarget, setRouteTarget] = useState('')
  const [invoiceOptions, setInvoiceOptions] = useState<{ code: string; title?: string }[]>([])

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null)
  const [confirmMia, setConfirmMia] = useState<string | null>(null)

  useEffect(() => { setRows(pcs) }, [pcs])

  useEffect(() => {
    if (mode !== 'route' || !firmSlug) return
    fetch(`/api/metrics/firm-invoices?firm=${encodeURIComponent(firmSlug)}`)
      .then(r => r.json())
      .then(d => setInvoiceOptions((d.invoices ?? []).map((inv: any) => ({ code: inv.code, title: inv.title }))))
      .catch(() => {})
  }, [mode, firmSlug])

  /* ── Mutations ─────────────────────────────────────────────────────────── */

  async function patchCase(id: string, body: Record<string, any>, apply: (pc: any) => any) {
    setBusy(true)
    try {
      const res = await fetch('/api/metrics/case', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      if (!res.ok) throw new Error('Update failed')
      setRows(prev => prev.map(p => (p.id === id ? apply(p) : p)))
    } finally { setBusy(false) }
  }

  async function handleDelete(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/metrics/case?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setRows(prev => prev.filter(p => p.id !== id))
      setConfirmDelete(null)
    } finally { setBusy(false) }
  }

  async function handleRoute() {
    if (!routeTarget || picked.size === 0) return
    setWorking(true)
    try {
      await Promise.all([...picked].map(id =>
        fetch('/api/metrics/case', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, invoice_code: routeTarget }),
        })))
      const moved = picked
      setRows(prev => prev.map(p => (moved.has(p.id) ? { ...p, invoiceCode: routeTarget } : p)))
      setDone(true)
      setTimeout(() => { setMode('none'); setPicked(new Set()); setRouteTarget(''); setDone(false) }, 1400)
    } finally { setWorking(false) }
  }

  async function handleLink() {
    const ids = [...picked]
    if (ids.length < 2) return
    setWorking(true)
    try {
      const res = await fetch('/api/metrics/pc-group', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'link' }),
      })
      const data = await res.json()
      if (data.groupId) setRows(prev => prev.map(p => (ids.includes(p.id) ? { ...p, accidentGroupId: data.groupId } : p)))
      setPicked(new Set()); setMode('none')
    } finally { setWorking(false) }
  }

  async function handleUnlink(id: string) {
    await fetch('/api/metrics/pc-group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], action: 'unlink' }),
    })
    setRows(prev => prev.map(p => (p.id === id ? { ...p, accidentGroupId: null } : p)))
  }

  function copySelected() {
    const byId = Object.fromEntries(rows.map(p => [p.id, p]))
    const text = copyPending.map(id => pcRowText(byId[id])).filter(Boolean).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopyDone(true)
      setTimeout(() => { setCopyDone(false); setCopyPending([]) }, 1500)
    })
  }

  /* ── Derived ───────────────────────────────────────────────────────────── */

  const isReplacement = (p: any) => (p.caseStatus || '').toLowerCase() === 'replacement'

  const sections = useMemo(() => ([
    {
      key: 'original',
      label: 'Original cases',
      hint: 'billable',
      items: rows.filter(p => !isReplacement(p) && !p.excludedFromPayment),
    },
    {
      key: 'extra',
      label: 'Extra victims',
      hint: 'same accident, not separately billed',
      items: rows.filter(p => !isReplacement(p) && p.excludedFromPayment),
    },
    {
      key: 'replacement',
      label: 'Replacements',
      hint: 'issued against an earlier case',
      items: rows.filter(isReplacement),
    },
  ].filter(s => s.items.length > 0)), [rows])

  const groupOrder = useMemo(() => {
    const order: string[] = []
    for (const pc of rows) if (pc.accidentGroupId && !order.includes(pc.accidentGroupId)) order.push(pc.accidentGroupId)
    return order
  }, [rows])

  const leaders = useMemo(() => {
    const by: Record<string, number> = {}
    for (const pc of rows) {
      if (isReplacement(pc)) continue
      const name = pc.workerName || pc.closer
      if (!name) continue
      by[name] = (by[name] || 0) + 1
    }
    return Object.entries(by).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [rows])

  const originals = sections.find(s => s.key === 'original')?.items.length ?? 0
  const extras = sections.find(s => s.key === 'extra')?.items.length ?? 0
  const replacements = sections.find(s => s.key === 'replacement')?.items.length ?? 0

  const selecting = mode !== 'none'
  const colCount = (selecting ? 1 : 0) + 9 + (selecting ? 0 : 3)

  function togglePick(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function exitMode() { setMode('none'); setPicked(new Set()); setRouteTarget('') }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {leaders.length > 0 && (
        <section className="mx-card" style={{ overflow: 'hidden' }}>
          <div className="mx-card-head">
            <span className="mx-card-title">Who signed them</span>
            <span className="mx-section-note">Original cases only — replacements are not credited</span>
          </div>
          <Leaderboard rows={leaders} unit="signed" />
        </section>
      )}

      <section className="mx-card" style={{ overflow: 'hidden' }}>
        <div className="mx-toolbar">
          <div className="mx-toolbar-stats">
            <span><b>{rows.length}</b>total</span>
            <span><b className="good">{originals}</b>original</span>
            {extras > 0 && <span><b className="accent">{extras}</b>extra {extras === 1 ? 'victim' : 'victims'}</span>}
            {replacements > 0 && <span><b className="warn">{replacements}</b>{replacements === 1 ? 'replacement' : 'replacements'}</span>}
          </div>

          <div className="mx-toolbar-actions">
            {copyPending.length > 0 && mode === 'none' && (
              <>
                <button className={`mx-btn ${copyDone ? 'mx-btn-accent' : 'mx-btn-primary'}`} onClick={copySelected}>
                  {copyDone ? `Copied ${copyPending.length}` : `Copy ${copyPending.length} ${copyPending.length === 1 ? 'row' : 'rows'}`}
                </button>
                <button className="mx-btn mx-btn-ghost" onClick={() => setCopyPending([])}>Clear</button>
              </>
            )}

            {mode === 'route' && (
              <>
                <span style={{ fontSize: 12, color: 'var(--mx-muted)' }}>{picked.size} selected</span>
                <button className="mx-btn mx-btn-quiet"
                  onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map(p => p.id)))}>
                  {picked.size === rows.length ? 'Deselect all' : 'Select all'}
                </button>
                <select className="mx-select" value={routeTarget} onChange={e => setRouteTarget(e.target.value)} aria-label="Target invoice">
                  <option value="">Move to…</option>
                  {invoiceOptions.map(inv => (
                    <option key={inv.code} value={inv.code}>{inv.code}{inv.title ? ` — ${inv.title}` : ''}</option>
                  ))}
                </select>
                <button className="mx-btn mx-btn-accent" disabled={!picked.size || !routeTarget || working} onClick={handleRoute}>
                  {done ? `Moved ${picked.size}` : working ? 'Moving…' : `Move ${picked.size || ''}`.trim()}
                </button>
                <button className="mx-btn mx-btn-ghost" onClick={exitMode}>Cancel</button>
              </>
            )}

            {mode === 'link' && (
              <>
                <span style={{ fontSize: 12, color: 'var(--mx-muted)' }}>{picked.size} selected</span>
                <button className="mx-btn mx-btn-primary" disabled={picked.size < 2 || working} onClick={handleLink}>
                  {working ? 'Linking…' : `Link ${picked.size || ''} as one accident`.replace('  ', ' ')}
                </button>
                <button className="mx-btn mx-btn-ghost" onClick={exitMode}>Cancel</button>
              </>
            )}

            {mode === 'none' && (
              <>
                {firmSlug && (
                  <button className="mx-btn mx-btn-quiet" onClick={() => setMode('route')} title="Move cases to a different invoice">
                    <IconRoute /> Move invoice
                  </button>
                )}
                <button className="mx-btn mx-btn-quiet" onClick={() => setMode('link')} title="Mark several cases as victims of the same accident">
                  <IconLink /> Link accident
                </button>
              </>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No signed cases on this invoice"
            text="Cases appear here once they are signed and tagged to this invoice window. Use Move invoice on another period to pull one across."
          />
        ) : (
          <div className="mx-tw">
            <table className="mx-table">
              <thead>
                <tr>
                  {selecting && <th style={{ width: 34 }} />}
                  <th>Client</th>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Signed</th>
                  <th>Replacement window</th>
                  {!selecting && <th className="num">Value</th>}
                  <th>Creative</th>
                  <th>Closer</th>
                  <th>2nd rep</th>
                  <th>OT</th>
                  {!selecting && <th>Accident</th>}
                  {!selecting && <th style={{ width: 92 }} />}
                </tr>
              </thead>

              <tbody>
                {sections.map(section => (
                  <React.Fragment key={section.key}>
                    {sections.length > 1 && (
                      <tr className="mx-subhead">
                        <td colSpan={colCount}>
                          {section.label}
                          <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginLeft: 8, color: 'var(--mx-faint)' }}>
                            {section.items.length} · {section.hint}
                          </span>
                        </td>
                      </tr>
                    )}

                    {section.items.map(pc => {
                      const repl = isReplacement(pc)
                      const isPicked = picked.has(pc.id)
                      const gIdx = pc.accidentGroupId ? groupOrder.indexOf(pc.accidentGroupId) : -1
                      const tone = gIdx >= 0 ? GROUP_TONES[gIdx % GROUP_TONES.length] : null

                      return (
                        <tr key={pc.id}
                          className={`row ${isPicked ? 'picked' : ''} ${repl ? 'repl' : ''}`}
                          style={{
                            cursor: selecting ? 'pointer' : undefined,
                            boxShadow: tone ? `inset 3px 0 0 ${tone.edge}` : undefined,
                          }}
                          onClick={selecting ? () => togglePick(pc.id) : undefined}>

                          {selecting && (
                            <td>
                              <input type="checkbox" className="mx-check" readOnly checked={isPicked}
                                style={{ pointerEvents: 'none' }} tabIndex={-1} />
                            </td>
                          )}

                          <td>
                            <div style={{ fontWeight: 600 }}>{pc.contactName || 'Unnamed contact'}</div>
                            <div style={{ fontSize: 11, color: 'var(--mx-muted)' }}>
                              {formatPhone(pc.contactPhone) || pc.contactEmail || ''}
                            </div>
                          </td>

                          <td style={{ whiteSpace: 'nowrap' }}>
                            {pc.invoiceCode
                              ? <span className="mx-chip" style={{ fontSize: 10.5 }}>{pc.invoiceCode}</span>
                              : <span className="mx-dim">—</span>}
                          </td>

                          <td><StatusBadge status={pc.caseStatus} /></td>

                          <td style={{ color: 'var(--mx-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {pc.qualifiedAt ? String(pc.qualifiedAt).split('T')[0] : '—'}
                          </td>

                          <td style={{ whiteSpace: 'nowrap' }}>
                            {repl ? (
                              <span style={{ fontSize: 11.5, color: 'var(--mx-warn)' }}>Replacement case</span>
                            ) : (
                              <>
                                <div style={{
                                  fontSize: 12, fontWeight: 600,
                                  color: pc.replacementNote === 'Window ended' ? 'var(--mx-crit)'
                                    : pc.replacementDaysLeft != null && pc.replacementDaysLeft <= 3 ? 'var(--mx-warn)'
                                    : 'var(--mx-ink)',
                                }}>{pc.replacementNote || '—'}</div>
                                {pc.replacementEnds && pc.replacementDaysLeft != null && (
                                  <div style={{ fontSize: 10.5, color: 'var(--mx-faint)' }}>until {pc.replacementEnds}</div>
                                )}
                              </>
                            )}
                          </td>

                          {!selecting && (
                            <td className="num" style={{ whiteSpace: 'nowrap' }}>
                              {pc.customCaseValue != null
                                ? <span style={{ fontWeight: 700, color: 'var(--mx-accent-ink)' }}>{money(pc.customCaseValue)}</span>
                                : <span className="mx-dim">—</span>}
                            </td>
                          )}

                          <td style={{ maxWidth: 170 }}>
                            {pc.adName
                              ? <span style={{ display: 'block', fontSize: 11.5, color: 'var(--mx-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pc.adName}>{pc.adName}</span>
                              : <span className="mx-dim">—</span>}
                          </td>

                          <td onClick={e => selecting || e.stopPropagation()}>
                            <InlineEdit
                              value={pc.workerName || pc.closer || ''}
                              placeholder="Add closer"
                              disabled={selecting || busy}
                              onSave={v => patchCase(pc.id, { closer: v }, p => ({ ...p, closer: v, workerName: v || p.workerName }))}
                            />
                          </td>

                          <td onClick={e => selecting || e.stopPropagation()}>
                            <InlineEdit
                              value={pc.secondWorkerName || pc.secondCloser || ''}
                              placeholder="Add rep"
                              disabled={selecting || busy}
                              onSave={v => patchCase(pc.id, { second_closer: v }, p => ({ ...p, secondCloser: v, secondWorkerName: v || null }))}
                            />
                          </td>

                          <td onClick={e => selecting || e.stopPropagation()}>
                            <button
                              className="mx-toggle"
                              aria-pressed={!!pc.isOtClose}
                              disabled={busy || selecting}
                              onClick={() => patchCase(pc.id, { is_ot_close: !pc.isOtClose }, p => ({ ...p, isOtClose: !pc.isOtClose }))}
                              title={pc.isOtClose ? 'Overtime close — $50 commission. Click to clear.' : 'Mark as an overtime close ($50 commission)'}>
                              OT
                            </button>
                          </td>

                          {!selecting && (
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {tone && gIdx >= 0 ? (
                                <span className="mx-group" style={{ background: tone.bg, color: tone.fg }}>
                                  Group {gIdx + 1}
                                  <button className="mx-group-x" onClick={e => { e.stopPropagation(); handleUnlink(pc.id) }}
                                    title="Remove from this accident group" aria-label="Unlink">×</button>
                                </span>
                              ) : <span className="mx-dim">—</span>}
                            </td>
                          )}

                          {!selecting && (
                            <td onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                                <CopyRowButton pc={pc} selected={copyPending.includes(pc.id)}
                                  onToggle={id => setCopyPending(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])} />

                                {!repl && (
                                  <ConfirmAction bordered
                                    armed={confirmReplace === pc.id}
                                    label="Mark replacement"
                                    title="Mark this case as a replacement"
                                    onArm={() => setConfirmReplace(pc.id)}
                                    onCancel={() => setConfirmReplace(null)}
                                    onConfirm={() => { patchCase(pc.id, { case_status: 'replacement' }, p => ({ ...p, caseStatus: 'replacement' })); setConfirmReplace(null) }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>REPL</span>
                                  </ConfirmAction>
                                )}

                                {!repl && (pc.caseStatus || '').toLowerCase() !== 'mia' && (
                                  <ConfirmAction bordered
                                    armed={confirmMia === pc.id}
                                    label="Mark MIA"
                                    title="Mark this case as MIA"
                                    onArm={() => setConfirmMia(pc.id)}
                                    onCancel={() => setConfirmMia(null)}
                                    onConfirm={() => { patchCase(pc.id, { case_status: 'mia' }, p => ({ ...p, caseStatus: 'mia' })); setConfirmMia(null) }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>MIA</span>
                                  </ConfirmAction>
                                )}

                                <ConfirmAction
                                  armed={confirmDelete === pc.id}
                                  label="Delete"
                                  title="Delete this case"
                                  onArm={() => setConfirmDelete(pc.id)}
                                  onCancel={() => setConfirmDelete(null)}
                                  onConfirm={() => handleDelete(pc.id)}>
                                  <IconTrash />
                                </ConfirmAction>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
