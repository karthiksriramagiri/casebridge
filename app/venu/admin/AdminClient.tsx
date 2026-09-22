'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Rep {
  id: string; name: string; role: string
  setter: boolean; closer: boolean
  tests: number; practice: number
  avg: number | null; criteria: number | null; empathy: number | null; nuance: number | null
  last: string | null
}

interface Session {
  id: string; repName: string; userId: string
  title: string | null; category: string | null
  mode: string; status: string; startedAt: string; durationSec: number | null
  score: number | null; criteria: number | null; empathy: number | null; nuanceCaught: boolean | null
}

function Toggle({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      className={`venu-toggle${on ? ' on' : ''}`}
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
    >
      <i />
    </button>
  )
}

export default function AdminClient({ reps, sessions }: { reps: Rep[]; sessions: Session[] }) {
  const [rows, setRows] = useState(reps)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [focus, setFocus] = useState<string | null>(null)

  async function toggle(id: string, field: 'setter' | 'closer', next: boolean) {
    setBusy(`${id}:${field}`)
    setError('')
    const before = rows
    setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: next } : x)))

    const res = await fetch('/api/venu/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, [field]: next }),
    })

    if (!res.ok) {
      setRows(before)
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not save that change.')
    }
    setBusy(null)
  }

  const visible = focus ? sessions.filter((s) => s.userId === focus) : sessions
  const focusName = focus ? rows.find((r) => r.id === focus)?.name : null

  return (
    <main className="venu-wrap" style={{ maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <Link href="/venu" className="venu-eyebrow" style={{ textDecoration: 'none' }}>← Venu</Link>
        <h1 className="venu-h2" style={{ fontSize: 24 }}>Team</h1>
      </div>

      {error && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginBottom: 16 }}>{error}</div>}

      <section>
        <h2 className="venu-h2" style={{ marginBottom: 12 }}>Reps &amp; access</h2>
        <div className="venu-card" style={{ overflowX: 'auto' }}>
          <table className="venu-table">
            <thead>
              <tr>
                <th>Rep</th>
                <th>Setter</th>
                <th>Closer</th>
                <th>Tests</th>
                <th>Avg</th>
                <th>Criteria</th>
                <th>Empathy</th>
                <th>Nuance</th>
                <th>Last call</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={focus === r.id ? 'is-focus' : ''}>
                  <td>
                    <button className="venu-linkish" onClick={() => setFocus(focus === r.id ? null : r.id)}>
                      {r.name}
                    </button>
                    {r.role === 'admin' && <span className="venu-tag" style={{ marginLeft: 8 }}>admin</span>}
                  </td>
                  <td><Toggle on={r.setter} busy={busy === `${r.id}:setter`} onClick={() => toggle(r.id, 'setter', !r.setter)} /></td>
                  <td><Toggle on={r.closer} busy={busy === `${r.id}:closer`} onClick={() => toggle(r.id, 'closer', !r.closer)} /></td>
                  <td>{r.tests || '—'}<span style={{ color: 'var(--muted)' }}>{r.practice ? ` +${r.practice}p` : ''}</span></td>
                  <td><strong>{r.avg ?? '—'}</strong></td>
                  <td>{r.criteria ?? '—'}</td>
                  <td>{r.empathy ?? '—'}</td>
                  <td>{r.nuance === null ? '—' : `${r.nuance}%`}</td>
                  <td style={{ color: 'var(--muted)' }}>
                    {r.last ? new Date(r.last).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>
          Averages count test calls only. &ldquo;Nuance&rdquo; is how often they found the detail that decided the case.
          Click a name to filter the calls below.
        </p>
      </section>

      <section style={{ marginTop: 34 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <h2 className="venu-h2">Calls</h2>
          {focusName && (
            <button className="venu-linkish" onClick={() => setFocus(null)}>
              {focusName} — clear filter ✕
            </button>
          )}
        </div>
        <div className="venu-card">
          {visible.length === 0 ? (
            <p className="venu-empty">No calls yet.</p>
          ) : visible.slice(0, 60).map((s) => (
            <div key={s.id} className="venu-row">
              <span style={{ width: 40, fontWeight: 700, fontSize: 17 }}>{s.score ?? '—'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontWeight: 600 }}>{s.repName}</strong>
                <span style={{ color: 'var(--muted)' }}> · {s.title ?? 'Call'}</span>
                <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
                  <span className={`venu-mode-tag ${s.mode}`}>{s.mode}</span>
                  {s.score !== null && <> · criteria {s.criteria} · empathy {s.empathy} · {s.nuanceCaught ? 'caught nuance' : 'missed nuance'}</>}
                  {s.durationSec ? ` · ${Math.floor(s.durationSec / 60)}m ${s.durationSec % 60}s` : ''}
                  {' · '}{new Date(s.startedAt).toLocaleString()}
                </span>
              </span>
              {s.score !== null
                ? <Link href={`/venu/result/${s.id}`} className="venu-tag" style={{ textDecoration: 'none' }}>Open</Link>
                : <span className="venu-tag">{s.status}</span>}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
