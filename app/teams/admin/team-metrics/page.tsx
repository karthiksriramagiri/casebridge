'use client'

import { useEffect, useMemo, useState } from 'react'
import { money, shortDate, Overlay, EmptyState, DashboardSkeleton, IconPlus, IconClose, IconChevron, IconWarn } from '@/app/_metrics/dash'
import '@/app/_metrics/metrics.css'

/* ═══════════════════════════════════════════════════════════════════════════
   Team Center

   Lifted out of the old combined /metrics dashboard. It lives under
   /teams/admin rather than on its own subdomain because reps and the people
   managing them should not be two separate products — and because this route
   already inherits the Supabase admin-role gate in proxy.ts.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function TeamMetricsPage() {
  const [workers, setWorkers] = useState<any[]>([])
  const [timeEntries, setTimeEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const [showAddWorker, setShowAddWorker] = useState(false)
  const [createdWorker, setCreatedWorker] = useState<{ name: string; password: string } | null>(null)

  useEffect(() => {
    let c = false
    const today = new Date().toISOString().slice(0, 10)
    Promise.allSettled([
      fetch('/api/metrics/workers').then(r => r.json()),
      fetch(`/api/metrics/time-entries?date=${today}`).then(r => r.json()),
    ]).then(([w, t]) => {
      if (c) return
      if (w.status === 'fulfilled') setWorkers(w.value?.workers || [])
      if (t.status === 'fulfilled') setTimeEntries(t.value?.workers || [])
      setLoading(false)
    })
    return () => { c = true }
  }, [nonce])

  return (
    <div className="mx metrics-page">
      <main className="mx-main">
        {loading
          ? <DashboardSkeleton />
          : <HRTab workers={workers} timeEntries={timeEntries} onAdd={() => setShowAddWorker(true)} />}
      </main>

      {(showAddWorker || createdWorker) && (
        <AddWorkerDialog
          created={createdWorker}
          onCreated={(w, id) => { setCreatedWorker(w); setWorkers(prev => [...prev, { id, name: w.name }]) }}
          onClose={() => { setShowAddWorker(false); setCreatedWorker(null); setNonce(n => n + 1) }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Team
   ═══════════════════════════════════════════════════════════════════════════ */

function HRTab({ workers, timeEntries, onAdd }: { workers: any[]; timeEntries: any[]; onAdd: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const byProfile: Record<string, any> = {}
    for (const te of timeEntries) byProfile[te.profileId] = te
    const now = Date.now()
    return workers.map(w => {
      const entries: any[] = byProfile[w.profileId]?.entries || []
      const hoursToday = entries.reduce((total, e) => {
        const end = e.clock_out ? new Date(e.clock_out).getTime() : now
        return total + Math.max(0, (end - new Date(e.clock_in).getTime()) / 3600000)
      }, 0)
      return { ...w, hoursToday, clockedIn: entries.some(e => !e.clock_out) }
    })
  }, [workers, timeEntries])

  const onNow = rows.filter(w => w.clockedIn).length
  const periodHours = rows.reduce((s, w) => s + (w.regularHours || 0) + (w.overtimeHours || 0), 0)
  const otHours = rows.reduce((s, w) => s + (w.overtimeHours || 0), 0)
  const payroll = rows.reduce((s, w) => s + (w.nextPayment || 0), 0)
  const signed = rows.reduce((s, w) => s + (w.signedCases || 0), 0)
  const closed = rows.reduce((s, w) => s + (w.closedCases || 0), 0)
  const period = workers[0]

  return (
    <>
      <div className="mx-section-head" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="mx-page-title">Team <i>&amp; payroll</i></h1>
          <p className="mx-page-sub">
            $30 per close, $50 for an overtime close, a split close counts as a half each.
            Overtime pays $6/hr after nine hours. Paid every second Friday.
          </p>
        </div>
        <button className="mx-btn mx-btn-primary" onClick={onAdd}><IconPlus /> Add worker</button>
      </div>

      <div className="mx-hero" style={{ marginBottom: 22 }}>
        <div className="mx-hero-cell">
          <span className="mx-hero-label">On the clock</span>
          <span className={`mx-hero-value ${onNow > 0 ? 'is-good' : 'is-empty'}`}>{onNow}</span>
          <span className="mx-hero-foot">of {rows.length} on the team</span>
        </div>
        <div className="mx-hero-cell">
          <span className="mx-hero-label">Period hours</span>
          <span className="mx-hero-value">{periodHours.toFixed(1)}<small style={{ fontSize: '0.5em', fontWeight: 600, marginLeft: 2 }}>h</small></span>
          <span className="mx-hero-foot">
            {otHours > 0 ? `${otHours.toFixed(1)}h of it overtime` : 'No overtime this period'}
          </span>
        </div>
        <div className="mx-hero-cell">
          <span className="mx-hero-label">Signed</span>
          <span className="mx-hero-value">{signed}</span>
          <span className="mx-hero-foot">{closed} closed</span>
        </div>
        <div className="mx-hero-cell">
          <span className="mx-hero-label">Hours today</span>
          <span className="mx-hero-value">{rows.reduce((s, w) => s + w.hoursToday, 0).toFixed(1)}<small style={{ fontSize: '0.5em', fontWeight: 600, marginLeft: 2 }}>h</small></span>
          <span className="mx-hero-foot">across everyone clocked in</span>
        </div>
        <div className="mx-hero-cell">
          <span className="mx-hero-label">Next payroll</span>
          <span className="mx-hero-value" style={{ color: 'var(--mx-accent)' }}>{money(payroll)}</span>
          <span className="mx-hero-foot">
            {period?.nextPaymentDate ? `Due ${period.nextPaymentDate}` : ''}
            {period?.payPeriodStart ? ` · ${shortDate(period.payPeriodStart)}–${shortDate(period.payPeriodEnd)}` : ''}
          </span>
        </div>
      </div>

      <div className="mx-card">
        <div className="mx-card-head">
          <span className="mx-card-title">Everyone</span>
          <span className="mx-section-note">Expand a row to see base pay, commission and closes by firm</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No workers yet" text="Add the first intake rep and they will appear here with hours, closes and payroll."
            action={<button className="mx-btn mx-btn-primary" onClick={onAdd}><IconPlus /> Add worker</button>} />
        ) : (
          <div className="mx-tw">
            <table className="mx-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Worker</th>
                  <th className="num">Rate</th>
                  <th className="num">Today</th>
                  <th className="num">Period</th>
                  <th className="num">Overtime</th>
                  <th className="num">Signed</th>
                  <th className="num">Closed</th>
                  <th className="num">Next payment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(w => {
                  const key = w.profileId || w.name
                  const isOpen = expanded === key
                  return (
                    <WorkerRow key={key} w={w} isOpen={isOpen}
                      onToggle={() => setExpanded(isOpen ? null : key)} />
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td className="lbl">Total</td>
                  <td />
                  <td className="num">{rows.reduce((s, w) => s + w.hoursToday, 0).toFixed(1)}h</td>
                  <td className="num">{rows.reduce((s, w) => s + (w.regularHours || 0), 0).toFixed(1)}h</td>
                  <td className="num">{otHours > 0 ? `${otHours.toFixed(1)}h` : '—'}</td>
                  <td className="num">{signed}</td>
                  <td className="num">{closed}</td>
                  <td className="num">{money(payroll)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function WorkerRow({ w, isOpen, onToggle }: { w: any; isOpen: boolean; onToggle: () => void }) {
  const idle = !w.signedCases && !w.regularHours && !w.hoursToday
  return (
    <>
      <tr className={`row ${isOpen ? 'is-open' : ''}`}>
        <td>
          <button className={`mx-expand ${isOpen ? 'open' : ''}`} onClick={onToggle} aria-expanded={isOpen}
            aria-label={isOpen ? `Hide details for ${w.name}` : `Show details for ${w.name}`}>
            <IconChevron size={12} />
          </button>
        </td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`mx-dot ${w.clockedIn ? 'on' : 'off'}`} title={w.clockedIn ? 'Clocked in' : 'Not clocked in'} />
            <span style={{ fontWeight: 600, color: idle ? 'var(--mx-muted)' : 'var(--mx-ink)' }}>{w.name}</span>
          </div>
        </td>
        <td className="num" style={{ color: 'var(--mx-muted)' }}>${(w.hourlyRate ?? 5).toFixed(2)}</td>
        <td className="num" style={{ fontWeight: w.hoursToday > 0 ? 650 : 400, color: w.hoursToday > 0 ? 'var(--mx-ink)' : 'var(--mx-faint)' }}>
          {w.hoursToday > 0 ? `${w.hoursToday.toFixed(2)}h` : '—'}
        </td>
        <td className="num" style={{ fontWeight: 650 }}>{w.regularHours > 0 ? `${w.regularHours.toFixed(2)}h` : <span className="mx-dim">—</span>}</td>
        <td className="num" style={{ color: w.overtimeHours > 0 ? 'var(--mx-warn)' : 'var(--mx-faint)', fontWeight: w.overtimeHours > 0 ? 650 : 400 }}>
          {w.overtimeHours > 0 ? `${w.overtimeHours.toFixed(2)}h` : '—'}
        </td>
        <td className="num" style={{ fontWeight: 650 }}>{w.signedCases || <span className="mx-dim">—</span>}</td>
        <td className="num" style={{ fontWeight: 650, color: w.closedCases > 0 ? 'var(--mx-good)' : undefined }}>
          {w.closedCases || <span className="mx-dim">—</span>}
        </td>
        <td className="num" style={{ fontWeight: 700, color: w.nextPayment > 0 ? 'var(--mx-ink)' : 'var(--mx-faint)' }}>
          {w.nextPayment > 0 ? money(w.nextPayment, { cents: true }) : '—'}
        </td>
      </tr>

      {isOpen && (
        <tr className="mx-detail">
          <td colSpan={9} style={{ padding: 0 }}>
            <div className="mx-detail-inner">
              <div>
                <p className="mx-eyebrow" style={{ marginBottom: 8 }}>How the next payment is built</p>
                <div className="mx-detail-grid">
                  <PayCell label="Base pay" value={money(w.basePay ?? 0, { cents: true })}
                    note={`${(w.regularHours || 0).toFixed(2)}h at $${(w.hourlyRate ?? 5).toFixed(2)}`} />
                  <PayCell label="Commission" value={money(w.commissionInPeriod ?? 0)}
                    note={`${w.closedInPeriod || 0} × $30${w.otClosedInPeriod ? ` · ${w.otClosedInPeriod} OT × $50` : ''}`} />
                  <PayCell label="Replacements" value={String(w.replacementsInPeriod ?? 0)} note="in this period" />
                  <PayCell label="Total" value={money(w.nextPayment ?? 0, { cents: true })}
                    note={w.nextPaymentDate ? `due ${w.nextPaymentDate}` : ''} accent />
                </div>
              </div>

              {w.closedByFirm?.length > 0 && (
                <div>
                  <p className="mx-eyebrow" style={{ marginBottom: 8 }}>Closes by firm</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {w.closedByFirm.map((f: any) => (
                      <span className="mx-chip" key={f.firmId}>
                        {f.firmName}
                        <b>{f.signedCases} signed</b>
                        <b style={{ color: 'var(--mx-good)' }}>{f.closedCases} closed</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function PayCell({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className="mx-stage-btn" style={{ cursor: 'default' }}>
      <span className="mx-stage-btn-label">{label}</span>
      <span className="mx-stage-btn-val" style={{ color: accent ? 'var(--mx-accent)' : undefined }}>{value}</span>
      {note && <span style={{ fontSize: 10.5, color: 'var(--mx-muted)' }}>{note}</span>}
    </div>
  )
}
/* ═══════════════════════════════════════════════════════════════════════════
   Dialogs
   ═══════════════════════════════════════════════════════════════════════════ */

function AddWorkerDialog({ created, onCreated, onClose }: {
  created: { name: string; password: string } | null
  onCreated: (w: { name: string; password: string }, id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('A full name is required.'); return }
    if (password.length < 6) { setError('The temporary password needs at least 6 characters.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/teams/admin/reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'The worker could not be created.'); return }
      onCreated({ name: name.trim(), password }, data.id)
      setName(''); setPassword('')
    } catch {
      setError('Connection failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose} variant="dialog" labelledBy="worker-title">
      <div className="mx-dialog-head">
        <h2 id="worker-title" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          {created ? 'Worker created' : 'Add worker'}
        </h2>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      <div className="mx-dialog-body">
        {created ? (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--mx-muted)', marginBottom: 14 }}>
              Send these to {created.name}. The password is shown once.
            </p>
            <div style={{ background: 'var(--mx-surface-2)', border: '1px solid var(--mx-line)', borderRadius: 10, padding: 16, display: 'grid', gap: 13 }}>
              <div><div className="mx-strip-label">Name</div><div style={{ fontWeight: 600 }}>{created.name}</div></div>
              <div>
                <div className="mx-strip-label">Temporary password</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14 }}>{created.password}</div>
              </div>
              <div>
                <div className="mx-strip-label">Sign-in URL</div>
                <div style={{ fontSize: 12.5, color: 'var(--mx-accent-ink)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  teams.case-bridge.com/teams/login
                </div>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={submit} id="worker-form" style={{ display: 'grid', gap: 14 }}>
            <div className="mx-field">
              <label className="mx-label" htmlFor="w-name">Full name</label>
              <input id="w-name" className="mx-input" value={name} autoFocus
                aria-invalid={!!error && !name.trim()}
                onChange={e => { setName(e.target.value); setError('') }}
                placeholder="Marisol Otero" />
            </div>
            <div className="mx-field">
              <label className="mx-label" htmlFor="w-pass">Temporary password</label>
              <input id="w-pass" className="mx-input" type="password" value={password}
                aria-invalid={!!error && password.length < 6}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="At least 6 characters" />
              <span className="mx-hint">They will be asked to change it at first sign-in.</span>
            </div>
            {error && <p className="mx-error"><IconWarn size={13} /> {error}</p>}
          </form>
        )}
      </div>

      <div className="mx-dialog-foot" style={{ justifyContent: 'flex-end' }}>
        {created ? (
          <button className="mx-btn mx-btn-primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <button className="mx-btn mx-btn-quiet" onClick={onClose} type="button">Cancel</button>
            <button className="mx-btn mx-btn-primary" form="worker-form" type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create worker'}
            </button>
          </>
        )}
      </div>
    </Overlay>
  )
}


