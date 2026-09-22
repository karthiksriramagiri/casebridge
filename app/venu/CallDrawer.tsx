'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Turn {
  speaker: 'rep' | 'caller'
  text: string
  startMs: number
  endMs: number
  audioPath?: string | null
}

interface Detail {
  id: string
  title: string
  category: string
  mode: string
  status: string
  durationSec: number | null
  repName: string
  transcript: Turn[]
  metrics: Record<string, any>
  scorecard: any | null
  book: { disposition: string; reason: string; nuance: string } | null
}

function mmss(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export default function CallDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState<number | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/venu/call?id=${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not load')
        return r.json()
      })
      .then((d) => { if (live) setData(d) })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  /** Rep turns play their stored audio; the caller's lines are re-spoken. */
  const play = useCallback(async (turn: Turn, index: number) => {
    try {
      audio.current?.pause()
      const el = audio.current ?? new Audio()
      audio.current = el

      if (turn.speaker === 'rep') {
        if (!turn.audioPath) return
        const res = await fetch(`/api/venu/audio?path=${encodeURIComponent(turn.audioPath)}`)
        if (!res.ok) throw new Error('unavailable')
        el.src = (await res.json()).url
      } else {
        el.src = `/api/venu/tts?text=${encodeURIComponent(turn.text)}`
      }

      setPlaying(index)
      el.onended = () => setPlaying(null)
      el.onerror = () => setPlaying(null)
      await el.play()
    } catch {
      setPlaying(null)
    }
  }, [])

  useEffect(() => () => { audio.current?.pause() }, [])

  const card = data?.scorecard
  const checkpoints = card?.checkpoints ?? []
  const covered = checkpoints.filter((c: any) => c.status === 'surfaced').length

  return (
    <>
      <div className="venu-scrim" onClick={onClose} />
      <aside className="venu-drawer" role="dialog" aria-label="Call review">
        <header className="venu-drawer-head">
          <div style={{ minWidth: 0 }}>
            <p className="venu-eyebrow">{data?.mode ?? ''} · review</p>
            <h2 className="venu-h2" style={{ fontSize: 18, marginTop: 4 }}>
              {data?.title ?? 'Loading…'}
            </h2>
          </div>
          <button className="venu-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="venu-drawer-body">
          {error && <div className="venu-note" style={{ borderColor: '#f0c4c0' }}>{error}</div>}
          {!data && !error && <p className="venu-empty">Loading…</p>}

          {data && !card && (
            <p className="venu-empty">
              This call wasn&rsquo;t scored — it ended before you said anything, or scoring failed.
            </p>
          )}

          {card && (
            <>
              <section className="venu-drawer-scores">
                <div>
                  <span className="venu-score-num" style={{ fontSize: 46 }}>{card.overallScore}</span>
                  <span style={{ color: 'var(--muted)' }}> / 100</span>
                </div>
                <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                  <div>
                    <div className="venu-drawer-metric"><span>Criteria</span><span>{card.criteriaScore}</span></div>
                    <div className="venu-meter"><i style={{ width: `${card.criteriaScore}%` }} /></div>
                  </div>
                  <div>
                    <div className="venu-drawer-metric"><span>Empathy</span><span>{card.empathy?.score}</span></div>
                    <div className="venu-meter"><i style={{ width: `${card.empathy?.score ?? 0}%` }} /></div>
                  </div>
                </div>
              </section>

              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                {card.coachingSummary}
              </p>

              {card.doDifferentlyNextTime?.length > 0 && (
                <section>
                  <p className="venu-eyebrow venu-drawer-label">Where to improve</p>
                  <div className="venu-card">
                    {card.doDifferentlyNextTime.map((d: string, i: number) => (
                      <div key={i} className="venu-row">
                        <span style={{ color: 'var(--muted)', width: 14 }}>{i + 1}</span>
                        <span style={{ flex: 1 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {card.stateGate && (
                <section>
                  <p className="venu-eyebrow venu-drawer-label">State gate</p>
                  <div className="venu-card" style={{ padding: 16 }}>
                    <span className={`venu-pill ${card.stateGate.handledCorrectly ? 'surfaced' : 'missed'}`}>
                      {card.stateGate.inFootprint ? 'in footprint' : 'out of state — instant no'}
                    </span>
                    <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 10 }}>{card.stateGate.note}</p>
                    <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>
                      {card.stateGate.confirmedByRep
                        ? `Confirmed out loud after ${card.stateGate.turnsBeforeAsking} turn${card.stateGate.turnsBeforeAsking === 1 ? '' : 's'}.`
                        : 'Never confirmed out loud — the form field was taken on trust.'}
                    </p>
                  </div>
                </section>
              )}

              <section>
                <p className="venu-eyebrow venu-drawer-label">
                  {card.stateGate && !card.stateGate.inFootprint
                    ? 'Checkpoints — not applicable, the case was already dead'
                    : `Checkpoints — ${covered}/${checkpoints.length} covered`}
                </p>
                <div className="venu-card">
                  {checkpoints.map((c: any) => (
                    <div key={c.id} className="venu-row">
                      <span className={`venu-pill ${c.status}`}>{c.status}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontWeight: 600 }}>{c.label}</strong>
                        {c.note && (
                          <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
                            {c.note}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <p className="venu-eyebrow venu-drawer-label">The detail that decided it</p>
                <div className="venu-card" style={{ padding: 16 }}>
                  <span className={`venu-pill ${card.nuance?.caught ? 'surfaced' : 'missed'}`}>
                    {card.nuance?.caught ? 'you found it' : 'you missed it'}
                  </span>
                  <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 10 }}>{card.nuance?.detail}</p>
                  <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.5 }}>
                    {card.nuance?.note}
                  </p>
                </div>
              </section>
            </>
          )}

          {data && data.transcript.length > 0 && (
            <section>
              <p className="venu-eyebrow venu-drawer-label">
                Recording &amp; transcript — {mmss((data.durationSec ?? 0) * 1000)}
              </p>
              <div className="venu-card" style={{ padding: 6 }}>
                {data.transcript.map((t, i) => (
                  <div key={i} className={`venu-play-row ${t.speaker}`}>
                    <button
                      className={`venu-play${playing === i ? ' is-playing' : ''}`}
                      onClick={() => play(t, i)}
                      disabled={t.speaker === 'rep' && !t.audioPath}
                      title={
                        t.speaker === 'rep'
                          ? (t.audioPath ? 'Play what you said' : 'No audio stored for this turn')
                          : 'Hear this line again'
                      }
                    >
                      {playing === i ? '❚❚' : '▶'}
                    </button>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="who">
                        {mmss(t.startMs)} · {t.speaker === 'rep' ? (data.repName || 'You') : 'Caller'}
                      </span>
                      {t.text}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                Your turns play the audio recorded on the call. The caller&rsquo;s lines are re-spoken.
              </p>
            </section>
          )}
        </div>
      </aside>
    </>
  )
}
