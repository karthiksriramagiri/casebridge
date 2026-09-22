'use client'

import { useState } from 'react'
import CallDrawer from './CallDrawer'

export interface CallRow {
  id: string
  title: string
  mode: string
  status: string
  startedAt: string
  durationSec: number | null
  score: number | null
  criteria: number | null
  empathy: number | null
  nuanceCaught: boolean | null
}

export default function CallsList({ rows }: { rows: CallRow[] }) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <div className="venu-card">
        {rows.length === 0 ? (
          <p className="venu-empty">No calls yet. Start with practice — it takes about five minutes.</p>
        ) : rows.map((r) => (
          <button key={r.id} className="venu-row venu-row-button" onClick={() => setOpen(r.id)}>
            <span style={{ width: 42, fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', textAlign: 'left' }}>
              {r.score ?? '—'}
            </span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <strong style={{ fontWeight: 600 }}>{r.title ?? 'Call'}</strong>
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
                <span className={`venu-mode-tag ${r.mode}`}>{r.mode}</span>
                {r.score !== null && (
                  <> · criteria {r.criteria} · empathy {r.empathy} · {r.nuanceCaught ? 'caught the nuance' : 'missed the nuance'}</>
                )}
                {r.durationSec ? ` · ${Math.floor(r.durationSec / 60)}m ${r.durationSec % 60}s` : ''}
                {' · '}{new Date(r.startedAt).toLocaleDateString()}
              </span>
            </span>
            <span className="venu-tag">{r.score !== null ? 'Review' : r.status}</span>
          </button>
        ))}
      </div>

      {open && <CallDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  )
}
