'use client'

import { useMemo, useState } from 'react'

export interface WeightField { key: string; label: string; help: string }
export interface BucketRow { bucket: string; scenarios: number; share: number }

export default function DrawMix({
  fields, initial, buckets, defaults,
}: {
  fields: WeightField[]
  initial: Record<string, number>
  buckets: BucketRow[]
  defaults: Record<string, number>
}) {
  const [weights, setWeights] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState(buckets)

  const dirty = useMemo(
    () => fields.some((f) => Number(weights[f.key]) !== Number(saved[f.key])),
    [weights, saved, fields]
  )

  async function save() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/venu/admin/weights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(weights),
    })
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not save.')
      setBusy(false)
      return
    }
    // Recompute the projected mix from the server with the saved weights.
    const mix = await fetch('/api/venu/admin/weights/mix').then((r) => r.json()).catch(() => null)
    if (mix?.buckets) setRows(mix.buckets)
    setSaved(weights)
    setBusy(false)
  }

  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h2 className="venu-h2">Scenario mix</h2>
        {dirty && <span className="venu-mode-tag test">unsaved</span>}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
        How often each kind of case comes up. Higher number means more often; the values are
        relative to each other, not percentages. The two multipliers scale their group down.
      </p>

      {error && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginBottom: 12 }}>{error}</div>}

      <div className="venu-card" style={{ padding: 18 }}>
        <div className="venu-weight-grid">
          {fields.map((f) => (
            <label key={f.key} className="venu-weight">
              <span className="venu-weight-label">{f.label}</span>
              <input
                className="venu-input"
                type="number"
                min={0}
                max={100}
                step={0.05}
                value={weights[f.key]}
                onChange={(e) => setWeights({ ...weights, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
              />
              <span className="venu-weight-help">{f.help}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
          <button className="venu-btn" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : dirty ? 'Save & recalculate' : 'Saved'}
          </button>
          <button
            className="venu-btn ghost"
            onClick={() => setWeights({ ...defaults })}
            disabled={busy}
          >
            Reset to defaults
          </button>
        </div>
      </div>

      <div className="venu-card" style={{ marginTop: 14 }}>
        <div className="venu-row" style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--muted)' }}>
          <span style={{ flex: 1 }}>What a rep actually draws</span>
          <span style={{ width: 90, textAlign: 'right' }}>scenarios</span>
          <span style={{ width: 70, textAlign: 'right' }}>share</span>
        </div>
        {rows.map((r) => (
          <div key={r.bucket} className="venu-row">
            <span style={{ flex: 1, minWidth: 0 }}>
              {r.bucket}
              <span className="venu-meter" style={{ marginTop: 6 }}>
                <i style={{ width: `${Math.min(100, r.share)}%` }} />
              </span>
            </span>
            <span style={{ width: 90, textAlign: 'right', color: 'var(--muted)' }}>{r.scenarios}</span>
            <span style={{ width: 70, textAlign: 'right', fontWeight: 700 }}>{r.share}%</span>
          </div>
        ))}
      </div>
      {dirty && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          The shares above still reflect the saved values — save to recalculate.
        </p>
      )}
    </section>
  )
}
