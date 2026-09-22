'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MetricsHeader } from '@/app/_metrics/chrome'
import {
  money, Overlay, EmptyState, Banner, ConfirmAction, Leaderboard,
  IconPlus, IconClose, IconWarn, IconCheck,
} from '@/app/_metrics/dash'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

type OOSCase = {
  id: string
  name: string
  state: string | null
  cost_per_case: number
  replacement_days: number | null
  replaced: boolean
  payment_cleared: boolean
  created_at: string
}

const BLANK = { name: '', state: '', cost_per_case: '', replacement_days: '' }

function daysLeft(createdAt: string, replacementDays: number): number {
  const due = new Date(createdAt)
  due.setDate(due.getDate() + replacementDays)
  return Math.ceil((due.getTime() - Date.now()) / 86400000)
}

export default function OOSCasesPage() {
  const [cases, setCases] = useState<OOSCase[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null)
  const [showReplaced, setShowReplaced] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/metrics/oos-cases')
      .then(r => r.json())
      .then(d => { setCases(d.cases || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function patch(id: string, body: Record<string, any>) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/metrics/oos-cases?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) setCases(prev => prev.map(c => (c.id === id ? data.case : c)))
    } finally { setBusyId(null) }
  }

  /* ── Derived ───────────────────────────────────────────────────────────── */

  const active = useMemo(() => cases.filter(c => !c.replaced), [cases])
  const replaced = useMemo(() => cases.filter(c => c.replaced), [cases])
  const shown = showReplaced ? cases : active

  const totalValue = active.reduce((s, c) => s + (c.cost_per_case || 0), 0)
  const cleared = active.filter(c => c.payment_cleared)
  const clearedValue = cleared.reduce((s, c) => s + (c.cost_per_case || 0), 0)

  const pending = active.filter(c => !c.payment_cleared && c.replacement_days != null)
  const overdue = pending.filter(c => daysLeft(c.created_at, c.replacement_days!) < 0)
  const dueSoon = pending.filter(c => {
    const d = daysLeft(c.created_at, c.replacement_days!)
    return d >= 0 && d <= 7
  })

  const byState = useMemo(() => {
    const m: Record<string, { n: number; value: number }> = {}
    for (const c of active) {
      const st = c.state || 'Unknown'
      const g = (m[st] ||= { n: 0, value: 0 })
      g.n += 1
      g.value += c.cost_per_case || 0
    }
    return Object.entries(m)
      .map(([name, g]) => ({ name, value: g.n, sub: money(g.value) }))
      .sort((a, b) => b.value - a.value)
  }, [active])

  /* Soonest payout first — this list is a work queue, not an archive. */
  const sorted = useMemo(() => {
    return [...shown].sort((a, b) => {
      if (a.replaced !== b.replaced) return a.replaced ? 1 : -1
      const ad = a.replacement_days != null && !a.payment_cleared ? daysLeft(a.created_at, a.replacement_days) : Infinity
      const bd = b.replacement_days != null && !b.payment_cleared ? daysLeft(b.created_at, b.replacement_days) : Infinity
      if (ad !== bd) return ad - bd
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [shown])

  return (
    <>
      <MetricsHeader onRefresh={load} />

      <main className="mx-main" id="mx-main">
        <div className="mx-section-head" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="mx-page-title">Out-of-state <i>cases</i></h1>
            <p className="mx-page-sub">
              Cases sold to external buyers. Tracked by hand — no ad spend runs against them,
              so the payout window is the only clock that matters.
            </p>
          </div>
          <button className="mx-btn mx-btn-primary" onClick={() => setShowForm(true)}>
            <IconPlus /> Add case
          </button>
        </div>

        {/* ── What needs chasing ───────────────────────────────────────── */}
        {(overdue.length > 0 || dueSoon.length > 0) && (
          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            {overdue.length > 0 && (
              <Banner tone="crit" title={`${overdue.length} payout${overdue.length === 1 ? '' : 's'} overdue`}>
                {overdue
                  .map(c => `${c.name} — ${Math.abs(daysLeft(c.created_at, c.replacement_days!))} days past due`)
                  .join(' · ')}
              </Banner>
            )}
            {dueSoon.length > 0 && (
              <Banner tone="warn" title={`${dueSoon.length} payout${dueSoon.length === 1 ? '' : 's'} due within a week`}>
                {dueSoon
                  .map(c => {
                    const d = daysLeft(c.created_at, c.replacement_days!)
                    return `${c.name} — ${d === 0 ? 'due today' : `${d} days left`}`
                  })
                  .join(' · ')}
              </Banner>
            )}
          </div>
        )}

        {/* ── Numbers ──────────────────────────────────────────────────── */}
        <div className="mx-hero" style={{ marginBottom: 26 }}>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Active cases</span>
            <span className={`mx-hero-value ${active.length ? '' : 'is-empty'}`}>{active.length}</span>
            <span className="mx-hero-foot">
              {replaced.length > 0 ? `${replaced.length} replaced and written off` : 'none replaced'}
            </span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Total value</span>
            <span className={`mx-hero-value ${totalValue ? 'is-good' : 'is-empty'}`}>{money(totalValue)}</span>
            <span className="mx-hero-foot">
              {active.length > 0 ? `${money(totalValue / active.length)} average per case` : 'no active cases'}
            </span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Cleared</span>
            <span className={`mx-hero-value ${cleared.length ? 'is-good' : 'is-empty'}`}>{money(clearedValue)}</span>
            <span className="mx-hero-foot">{cleared.length} of {active.length} paid</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Outstanding</span>
            <span className={`mx-hero-value ${totalValue - clearedValue > 0 ? 'is-warn' : 'is-empty'}`}>
              {money(totalValue - clearedValue)}
            </span>
            <span className="mx-hero-foot">{active.length - cleared.length} still to collect</span>
          </div>
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Overdue</span>
            <span className={`mx-hero-value ${overdue.length ? 'is-crit' : 'is-empty'}`}>{overdue.length}</span>
            <span className="mx-hero-foot">
              {dueSoon.length > 0 ? `${dueSoon.length} more due within 7 days` : 'nothing due this week'}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 3fr)', gap: 14, alignItems: 'start' }} className="mx-split">
          {/* ── Cases ──────────────────────────────────────────────────── */}
          <section>
            <div className="mx-section-head">
              <p className="mx-eyebrow">Cases · soonest payout first</p>
              {replaced.length > 0 && (
                <button className="mx-btn mx-btn-ghost" style={{ padding: '4px 8px' }}
                  onClick={() => setShowReplaced(v => !v)}>
                  {showReplaced ? 'Hide' : 'Show'} {replaced.length} replaced
                </button>
              )}
            </div>

            <div className="mx-card" style={{ overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 18, display: 'grid', gap: 10 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div className="mx-skel" key={i} style={{ height: 14, width: `${95 - i * 8}%` }} />
                  ))}
                </div>
              ) : sorted.length === 0 ? (
                <EmptyState
                  title="No out-of-state cases"
                  text="Record a case sold to an external buyer and its payout window starts counting here."
                  action={<button className="mx-btn mx-btn-primary" onClick={() => setShowForm(true)}><IconPlus /> Add case</button>}
                />
              ) : (
                <div className="mx-tw">
                  <table className="mx-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>State</th>
                        <th className="num">Value</th>
                        <th>Payout window</th>
                        <th className="num">Added</th>
                        <th>Payment</th>
                        <th style={{ width: 96 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(c => {
                        const d = c.replacement_days != null ? daysLeft(c.created_at, c.replacement_days) : null
                        const isOverdue = d != null && d < 0 && !c.payment_cleared
                        const isUrgent = d != null && d >= 0 && d <= 7 && !c.payment_cleared
                        return (
                          <tr className="row" key={c.id} style={c.replaced ? { opacity: 0.55 } : undefined}>
                            <td>
                              <span style={{ fontWeight: 600 }}>{c.name}</span>
                              {c.replaced && (
                                <span className="mx-chip" style={{ marginLeft: 8, fontSize: 10, background: 'var(--mx-crit-soft)', color: 'var(--mx-crit)' }}>
                                  Replaced
                                </span>
                              )}
                            </td>
                            <td>
                              {c.state
                                ? <span className="mx-chip" style={{ fontSize: 11 }}>{c.state}</span>
                                : <span className="mx-dim">—</span>}
                            </td>
                            <td className="num" style={{
                              fontWeight: 700,
                              color: c.replaced ? 'var(--mx-faint)' : 'var(--mx-good)',
                              textDecoration: c.replaced ? 'line-through' : undefined,
                            }}>
                              {money(c.cost_per_case)}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {c.replacement_days == null ? <span className="mx-dim">not set</span>
                                : c.replaced ? <span style={{ color: 'var(--mx-faint)', fontSize: 12 }}>{c.replacement_days} days</span>
                                : c.payment_cleared ? <span style={{ color: 'var(--mx-good)', fontSize: 12, fontWeight: 600 }}>settled</span>
                                : isOverdue ? <span className="mx-v-crit" style={{ fontSize: 12 }}>{Math.abs(d!)} days overdue</span>
                                : isUrgent ? <span className="mx-v-warn" style={{ fontSize: 12 }}>{d === 0 ? 'due today' : `${d} days left`}</span>
                                : <span style={{ color: 'var(--mx-muted)', fontSize: 12 }}>{d} days left</span>}
                            </td>
                            <td className="num" style={{ color: 'var(--mx-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                              {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td>
                              {!c.replaced && (
                                <button className="mx-toggle" aria-pressed={c.payment_cleared}
                                  disabled={busyId === c.id}
                                  onClick={() => patch(c.id, { payment_cleared: !c.payment_cleared })}
                                  title={c.payment_cleared ? 'Payment cleared — click to reopen' : 'Mark the payment as cleared'}
                                  style={c.payment_cleared
                                    ? { background: 'var(--mx-good-soft)', borderColor: 'var(--mx-good)', color: 'var(--mx-good)' }
                                    : undefined}>
                                  {c.payment_cleared ? 'Cleared' : 'Pending'}
                                </button>
                              )}
                            </td>
                            <td>
                              {!c.replaced && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  <ConfirmAction bordered
                                    armed={confirmReplace === c.id}
                                    label="Write off"
                                    title="Mark replaced — this zeroes the case value"
                                    onArm={() => setConfirmReplace(c.id)}
                                    onCancel={() => setConfirmReplace(null)}
                                    onConfirm={() => { patch(c.id, { replaced: true }); setConfirmReplace(null) }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>REPLACED</span>
                                  </ConfirmAction>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="lbl">{active.length} active</td>
                        <td />
                        <td className="num">{money(totalValue)}</td>
                        <td colSpan={2} />
                        <td colSpan={2} style={{ fontWeight: 500, color: 'var(--mx-muted)', fontSize: 11.5 }}>
                          {money(clearedValue)} cleared · {money(totalValue - clearedValue)} outstanding
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* ── By state ───────────────────────────────────────────────── */}
          <section>
            <div className="mx-section-head">
              <p className="mx-eyebrow">By state</p>
              <p className="mx-section-note">active only</p>
            </div>
            <div className="mx-card" style={{ overflow: 'hidden' }}>
              {byState.length === 0
                ? <EmptyState compact title="Nothing to group" text="Add a case with a state to see the split." />
                : <Leaderboard rows={byState} unit="cases" />}
            </div>
          </section>
        </div>
      </main>

      {showForm && (
        <AddCaseDialog
          onClose={() => setShowForm(false)}
          onCreated={c => { setCases(prev => [c, ...prev]); setShowForm(false) }}
        />
      )}
    </>
  )
}

/* ── Add case ───────────────────────────────────────────────────────────── */

function AddCaseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: OOSCase) => void }) {
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('A client name is required.'); return }
    if (!form.cost_per_case || Number(form.cost_per_case) <= 0) { setError('Enter what the case sold for.'); return }

    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/metrics/oos-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          state: form.state || null,
          cost_per_case: Number(form.cost_per_case),
          replacement_days: form.replacement_days ? Number(form.replacement_days) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || 'The case could not be saved.'); return }
      onCreated(data.case)
    } catch {
      setError('Connection failed. Please try again.')
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose} variant="dialog" labelledBy="oos-title">
      <div className="mx-dialog-head">
        <div>
          <h2 id="oos-title" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Add out-of-state case</h2>
          <p style={{ fontSize: 12, color: 'var(--mx-muted)', margin: '3px 0 0' }}>
            A case sold to an external buyer.
          </p>
        </div>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      <div className="mx-dialog-body">
        <form id="oos-form" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <div className="mx-field">
            <label className="mx-label" htmlFor="oos-name">Client name</label>
            <input id="oos-name" className="mx-input" value={form.name} autoFocus
              placeholder="Danielle Okafor"
              onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError(null) }} />
          </div>

          <div className="mx-field">
            <label className="mx-label" htmlFor="oos-state">State</label>
            <select id="oos-state" className="mx-select" value={form.state}
              onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
              <option value="">Not recorded</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mx-field">
              <label className="mx-label" htmlFor="oos-cost">Sold for</label>
              <input id="oos-cost" className="mx-input" type="number" min="0" step="1"
                value={form.cost_per_case} placeholder="0"
                onChange={e => { setForm(f => ({ ...f, cost_per_case: e.target.value })); setError(null) }} />
            </div>
            <div className="mx-field">
              <label className="mx-label" htmlFor="oos-days">Payout window</label>
              <input id="oos-days" className="mx-input" type="number" min="0" step="1"
                value={form.replacement_days} placeholder="30"
                onChange={e => setForm(f => ({ ...f, replacement_days: e.target.value }))} />
              <span className="mx-hint">Days until payment is expected. Leave blank if open-ended.</span>
            </div>
          </div>

          {error && <p className="mx-error"><IconWarn size={13} /> {error}</p>}
        </form>
      </div>

      <div className="mx-dialog-foot" style={{ justifyContent: 'flex-end' }}>
        <button className="mx-btn mx-btn-quiet" type="button" onClick={onClose}>Cancel</button>
        <button className="mx-btn mx-btn-primary" type="submit" form="oos-form" disabled={saving}>
          {saving ? 'Saving…' : 'Add case'}
        </button>
      </div>
    </Overlay>
  )
}
