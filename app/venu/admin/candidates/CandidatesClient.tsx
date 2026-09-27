'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { STATUS_LABEL, turnsOf, waLink, type CandidateStatus } from '@/app/venu/_lib/candidates'

/* The review queue. Watch the interview, decide, and — only once qualified —
   create the Team Center account from the same card. */

type Candidate = {
  id: string
  token: string
  name: string
  email: string | null
  phone: string
  source: string | null
  answers: Record<string, any>
  recording_path: string | null
  recording_name: string | null
  status: CandidateStatus
  submitted_at: string | null
  created_at: string
  review_note: string | null
  reviewed_by_name: string | null
  whatsapp_group_url: string | null
  team_login_email: string | null
}

const ORDER: CandidateStatus[] = ['submitted', 'qualified', 'invited', 'onboarded', 'not_qualified']

export default function CandidatesClient() {
  const params = useSearchParams()
  const focus = params.get('c')

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [setupHint, setSetupHint] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(focus)
  const [applyUrl, setApplyUrl] = useState('/venu/apply')

  useEffect(() => { setApplyUrl(`${window.location.origin}/venu/apply`) }, [])

  const load = useCallback(async () => {
    const res = await fetch('/api/venu/candidates')
    const data = await res.json()
    if (data.setupRequired) setSetupHint(data.setupHint)
    setCandidates(data.candidates ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const groups = ORDER
    .map(status => ({ status, rows: candidates.filter(c => c.status === status) }))
    .filter(g => g.rows.length > 0)

  return (
    <main className="venu-wrap" style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px 80px' }}>
      <p className="venu-eyebrow">Hiring</p>
      <h1 className="venu-h1" style={{ fontSize: 30 }}>Interview reviews</h1>
      <p className="venu-sub" style={{ marginBottom: 22 }}>
        Candidates who opened the application link. Share it as <b>{applyUrl}</b>.
      </p>

      {setupHint && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginBottom: 18 }}>{setupHint}</div>}

      {loading ? (
        <p className="venu-sub">Loading…</p>
      ) : candidates.length === 0 ? (
        <div className="venu-card" style={{ padding: 28 }}>
          <h2 className="venu-h2">Nobody has applied yet</h2>
          <p className="venu-sub">Share the application link and submissions land here.</p>
        </div>
      ) : (
        groups.map(group => (
          <section key={group.status} style={{ marginBottom: 28 }}>
            <p className="venu-eyebrow" style={{ marginBottom: 10 }}>
              {STATUS_LABEL[group.status]} · {group.rows.length}
            </p>
            {group.rows.map(c => (
              <CandidateCard
                key={c.id}
                c={c}
                open={open === c.token}
                onToggle={() => setOpen(open === c.token ? null : c.token)}
                onChanged={load}
              />
            ))}
          </section>
        ))
      )}
    </main>
  )
}

function CandidateCard({ c, open, onToggle, onChanged }: {
  c: Candidate; open: boolean; onToggle: () => void; onChanged: () => void
}) {
  const [note, setNote] = useState(c.review_note ?? '')
  const [busy, setBusy] = useState('')
  const [recording, setRecording] = useState<string | null>(null)
  const [groupUrl, setGroupUrl] = useState(c.whatsapp_group_url ?? '')
  const [login, setLogin] = useState<{ name: string; password: string } | null>(null)
  const [teamType, setTeamType] = useState<'intake' | 'creative'>('intake')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (!c.recording_path || recording) return
    fetch(`/api/venu/candidates/${c.token}/recording`)
      .then(r => r.json())
      .then(d => { if (d.url) setRecording(d.url) })
      .catch(() => {})
  }, [open, c.recording_path, c.token, recording])

  async function decide(decision: 'qualified' | 'not_qualified' | 'submitted') {
    setBusy(decision); setError('')
    try {
      const res = await fetch(`/api/venu/candidates/${c.token}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not save.'); return }
      onChanged()
    } finally { setBusy('') }
  }

  async function onboard() {
    setBusy('onboard'); setError('')
    try {
      const res = await fetch(`/api/venu/candidates/${c.token}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamType, whatsappGroupUrl: groupUrl || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not create the account.'); return }
      if (data.password) setLogin({ name: data.loginName, password: data.password })
      onChanged()
    } finally { setBusy('') }
  }

  const when = c.submitted_at ?? c.created_at

  return (
    <div className="venu-card" style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit',
        }}
      >
        <span style={{ fontWeight: 650, fontSize: 14 }}>{c.name}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {c.phone ?? 'no number yet'}{c.source ? ` · ${c.source}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)' }}>
          {c.recording_path ? '🎧 ' : ''}{new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, margin: '14px 0 16px' }}>
            <a href={waLink(c.phone)} target="_blank" rel="noreferrer" className="venu-linkish">WhatsApp {c.phone}</a>
            {c.email && <a href={`mailto:${c.email}`} className="venu-linkish">{c.email}</a>}
            {c.reviewed_by_name && <span style={{ color: 'var(--muted)' }}>Reviewed by {c.reviewed_by_name}</span>}
          </div>

          {/* The call, once. The transcript underneath is for skimming — the
              recording is the thing being reviewed. */}
          {c.recording_path ? (
            recording
              ? <audio src={recording} controls style={{ width: '100%', margin: '4px 0 16px' }} />
              : <p className="venu-sub" style={{ fontSize: 12, margin: '4px 0 16px' }}>Loading the recording…</p>
          ) : (
            <div className="venu-note" style={{ marginBottom: 16, fontSize: 12.5 }}>
              No recording — they left before the call finished.
            </div>
          )}

          <div style={{ display: 'grid', gap: 12, margin: '4px 0 18px' }}>
            {turnsOf(c).map((t, i) => (
              <div key={i} style={{ textAlign: t.who === 'candidate' ? 'right' : 'left' }}>
                <p className="venu-eyebrow" style={{ marginBottom: 3 }}>{t.who === 'venu' ? 'Venu' : c.name}</p>
                <p style={{
                  display: 'inline-block', maxWidth: '88%', textAlign: 'left', fontSize: 13,
                  lineHeight: 1.5, padding: '8px 12px', borderRadius: 10,
                  background: t.who === 'candidate' ? 'var(--ink, #1b1714)' : 'rgba(255,255,255,.6)',
                  color: t.who === 'candidate' ? '#fff' : 'inherit',
                  border: t.who === 'candidate' ? 0 : '1px solid var(--line)',
                }}>{t.text}</p>
              </div>
            ))}
          </div>

          {error && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginBottom: 12 }}>{error}</div>}

          {c.status === 'submitted' || c.status === 'invited' ? (
            <>
              <label className="venu-label" htmlFor={`note-${c.id}`}>Notes for the record</label>
              <textarea id={`note-${c.id}`} className="venu-input" rows={2}
                value={note} onChange={e => setNote(e.target.value)} />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="venu-btn" onClick={() => decide('qualified')} disabled={!!busy}>
                  {busy === 'qualified' ? 'Saving…' : 'Qualified'}
                </button>
                <button className="venu-btn" style={{ background: 'transparent', color: 'var(--muted)' }}
                  onClick={() => decide('not_qualified')} disabled={!!busy}>
                  {busy === 'not_qualified' ? 'Saving…' : 'Not qualified'}
                </button>
              </div>
            </>
          ) : c.status === 'qualified' ? (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <h3 className="venu-h2" style={{ fontSize: 16 }}>Onboard to the Team Center</h3>
              <p className="venu-sub" style={{ marginBottom: 14 }}>
                Start the WhatsApp group with {c.phone}, paste its invite link here, then create their login —
                it will be their first name with 123 after it.
              </p>

              <label className="venu-label" htmlFor={`wa-${c.id}`}>WhatsApp group invite link</label>
              <input id={`wa-${c.id}`} className="venu-input" placeholder="https://chat.whatsapp.com/…"
                value={groupUrl} onChange={e => setGroupUrl(e.target.value)} />

              <label className="venu-label" htmlFor={`tt-${c.id}`} style={{ marginTop: 14 }}>Team</label>
              <select id={`tt-${c.id}`} className="venu-input" value={teamType}
                onChange={e => setTeamType(e.target.value as 'intake' | 'creative')}>
                <option value="intake">Intake</option>
                <option value="creative">Creative</option>
              </select>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="venu-btn" onClick={onboard} disabled={!!busy}>
                  {busy === 'onboard' ? 'Creating…' : 'Create Team Center login'}
                </button>
                <button className="venu-btn" style={{ background: 'transparent', color: 'var(--muted)' }}
                  onClick={() => decide('submitted')} disabled={!!busy}>
                  Undo decision
                </button>
              </div>
            </div>
          ) : c.status === 'onboarded' ? (
            <div className="venu-note">
              Onboarded. Login <b>{c.team_login_email}</b>
              {c.whatsapp_group_url && <> · <a className="venu-linkish" href={c.whatsapp_group_url} target="_blank" rel="noreferrer">WhatsApp group</a></>}
            </div>
          ) : (
            <div className="venu-note">
              Not qualified{c.review_note ? ` — ${c.review_note}` : ''}.{' '}
              <button className="venu-linkish" style={{ background: 'none', border: 0, cursor: 'pointer' }}
                onClick={() => decide('submitted')}>Reopen</button>
            </div>
          )}

          {login && (
            <div className="venu-note" style={{ marginTop: 14, borderColor: '#9ec9a8' }}>
              <b>Their Team Center login</b><br />
              Name <code style={{ fontSize: 14 }}>{login.name}</code> · Password{' '}
              <code style={{ fontSize: 14 }}>{login.password}</code>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
