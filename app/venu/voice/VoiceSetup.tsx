'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { ProsodyMeter, summarise } from '../_lib/prosody'
import { contrast } from '../_lib/voice-baseline'
import type { BaselineTake, VoiceBaseline } from '../_lib/voice-baseline'

type Script = { label: string; hint: string; text: string }

function Take({ take }: { take: BaselineTake }) {
  const rows: [string, string][] = [
    ['Pitch', take.medianF0 ? `${take.medianF0} Hz` : '—'],
    ['Pitch movement', take.pitchVariability !== null ? `${take.pitchVariability} st` : '—'],
    ['Warmth (tilt)', take.tilt !== null ? `${take.tilt} dB` : '—'],
    ['Pace', take.pace !== null ? `${take.pace}/s` : '—'],
    ['Level', `${take.meanDb} dB`],
  ]
  return (
    <div className="venu-take">
      {rows.map(([k, v]) => (
        <span key={k}><span className="venu-eyebrow">{k}</span><strong>{v}</strong></span>
      ))}
    </div>
  )
}

export default function VoiceSetup({
  scripts, existing,
}: { scripts: { neutral: Script; warm: Script }; existing: VoiceBaseline | null }) {
  const [takes, setTakes] = useState<{ neutral?: BaselineTake; warm?: BaselineTake }>({
    neutral: existing?.neutral, warm: existing?.warm ?? undefined,
  })
  const [recording, setRecording] = useState<'neutral' | 'warm' | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(!!existing)
  const [busy, setBusy] = useState(false)
  const [level, setLevel] = useState(0)
  const meter = useRef<ProsodyMeter | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback((which: 'neutral' | 'warm') => {
    const m = meter.current
    setRecording(null)
    if (levelTimer.current) clearInterval(levelTimer.current)
    setLevel(0)
    if (!m) return
    const take = summarise(m.frames)
    const stats = m.stats()
    m.stop()
    meter.current = null
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null

    if (!take || take.medianF0 === null) {
      // Say which part failed — "speak up" is useless advice when the real
      // problem is that the wrong input device is selected.
      setError(
        stats.frames < 20
          ? 'That was too short — hold the button and read the whole line.'
          : stats.peakDb < -50
            ? `Almost nothing reached the microphone (peak ${stats.peakDb}dB). Check the input device in your browser's site settings, then try again.`
            : `Heard you (peak ${stats.peakDb}dB) but could not track your pitch — only ${stats.voiced} of ${stats.frames} frames were voiced. Try again a little closer, and away from any fan or background noise.`
      )
      return
    }
    setError('')
    setSaved(false)
    setTakes((prev) => ({
      ...prev,
      [which]: {
        medianF0: take.medianF0,
        pitchVariability: take.pitchVariability,
        tilt: take.tilt ?? null,
        pace: take.pace ?? null,
        meanDb: take.meanDb,
      },
    }))
  }, [])

  const start = useCallback(async (which: 'neutral' | 'warm') => {
    setError('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      })
      stream.current = s
      const m = new ProsodyMeter()
      const t0 = performance.now()
      if (!m.start(s, () => Math.round(performance.now() - t0))) {
        throw new Error('This browser will not let us read the microphone.')
      }
      meter.current = m
      setRecording(which)
      levelTimer.current = setInterval(() => {
        const db = m.currentDb()
        // -60dB silence to -15dB loud, as a 0-100 bar.
        setLevel(Math.max(0, Math.min(100, ((db + 60) / 45) * 100)))
      }, 80)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the microphone.')
    }
  }, [])

  async function save() {
    if (!takes.neutral) {
      setError('Record the first take before saving.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/venu/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neutral: takes.neutral, warm: takes.warm ?? null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Never fail quietly here — a profile that silently did not save looks
        // identical to one that did, and the rep finds out weeks later.
        setError(body.error ?? `Could not save (HTTP ${res.status}).`)
        return
      }
      setSaved(true)
    } catch (e) {
      setError(`Could not reach the server: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function panel(which: 'neutral' | 'warm', script: Script) {
    const take = takes[which]
    const live = recording === which
    return (
      <div className="venu-card" style={{ padding: 20 }}>
        <p className="venu-eyebrow">{which === 'neutral' ? 'Take 1' : 'Take 2 — optional'}</p>
        <h2 className="venu-h2" style={{ fontSize: 18, marginTop: 4 }}>{script.label}</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{script.hint}</p>
        <p className="venu-script">{script.text}</p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          {live ? (
            <>
              <button className="venu-btn danger" onClick={() => stop(which)}>
                <span className="venu-live-dot" style={{ marginRight: 8 }} />Stop &amp; measure
              </button>
              <span className="venu-level" title="Input level">
                <i style={{ width: `${level}%` }} />
              </span>
            </>
          ) : (
            <button className="venu-btn" onClick={() => start(which)} disabled={!!recording}>
              {take ? 'Record again' : 'Record'}
            </button>
          )}
          {take && !live && <span className="venu-pill surfaced">measured</span>}
        </div>

        {take && !live && <Take take={take} />}
      </div>
    )
  }

  return (
    <main className="venu-wrap" style={{ maxWidth: 720 }}>
      <Link href="/venu" className="venu-eyebrow" style={{ textDecoration: 'none' }}>← Venu</Link>
      <h1 className="venu-h1" style={{ fontSize: 30, marginTop: 14 }}>Your voice</h1>
      <p className="venu-sub" style={{ maxWidth: 560 }}>
        Read two short lines so Venu knows how you sound normally, and how you sound when you
        mean it. Everything on a call is then measured against your own range rather than
        against a stranger&rsquo;s.
      </p>

      <div className="venu-note" style={{ margin: '18px 0' }}>
        <strong>This does not affect your score yet.</strong> The measurements are being collected
        and checked against real calls first. An earlier assumption here — that more pitch
        movement meant more warmth — turned out to be backwards once it was measured, so nothing
        grades anyone until it has been proven on your team&rsquo;s own recordings.
      </div>

      {error && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginBottom: 14 }}>{error}</div>}
      {saved && !error && (
        <div className="venu-ready" style={{ marginBottom: 14 }} role="status">
          <span className="venu-ready-dot" />
          <span style={{ flex: 1 }}>
            <strong>Voice profile saved.</strong> Calls from here are measured against it.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {panel('neutral', scripts.neutral)}
        {panel('warm', scripts.warm)}
      </div>

      {takes.neutral && takes.warm && (() => {
        const c = contrast({ neutral: takes.neutral, warm: takes.warm, capturedAt: '' })!
        const rows: [string, number | null, string][] = [
          ['Pitch', c.pitch, 'Hz'],
          ['Pitch movement', c.movement, 'st'],
          ['Warmth (tilt)', c.tilt, 'dB'],
          ['Pace', c.pace, '/s'],
          ['Level', c.level, 'dB'],
        ]
        const moved = rows.filter(([, v]) => v !== null && Math.abs(v) > 0.001)
        const biggest = moved.slice().sort((a, b) => Math.abs(b[1]!) - Math.abs(a[1]!))[0]
        // Everything within noise means the two reads were not actually
        // different, which is worth saying rather than hiding behind numbers.
        const flat = !biggest || Math.abs(biggest[1]!) < 0.3

        return (
          <section style={{ marginTop: 18 }}>
            <h2 className="venu-h2" style={{ marginBottom: 4 }}>Your range</h2>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
              How far your warm read sits from your plain one. This is the gap that later calls
              get measured against.
            </p>
            <div className="venu-card" style={{ padding: 18 }}>
              <div className="venu-take" style={{ border: 0, paddingTop: 0, marginTop: 0 }}>
                {rows.map(([label, v, unit]) => (
                  <span key={label}>
                    <span className="venu-eyebrow">{label}</span>
                    <strong style={{ color: v !== null && Math.abs(v) > 0.3 ? 'var(--teal-deep)' : 'var(--muted)' }}>
                      {v === null ? '—' : `${v > 0 ? '+' : ''}${v}${unit}`}
                    </strong>
                  </span>
                ))}
              </div>
              <p className="venu-note" style={{ marginTop: 14 }}>
                {flat ? (
                  <>Your two reads came out almost identical. That means these measurements
                  cannot yet tell your warm voice from your plain one — worth recording again
                  and letting the second one sound genuinely different, or it simply may not be
                  where your warmth shows up.</>
                ) : (
                  <>The clearest difference is <strong>{biggest[0].toLowerCase()}</strong>
                  {' '}({biggest[1]! > 0 ? '+' : ''}{biggest[1]}{biggest[2]}). Whether that
                  actually tracks warmth on a live call is the thing still to be proven — it is
                  being collected, not scored.</>
                )}
              </p>
            </div>
          </section>
        )
      })()}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
        <button className="venu-btn" onClick={save} disabled={!takes.neutral || busy || saved}>
          {busy ? 'Saving…' : saved ? 'Saved' : 'Save my voice profile'}
        </button>
        {existing && (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Last captured {new Date(existing.capturedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </main>
  )
}
