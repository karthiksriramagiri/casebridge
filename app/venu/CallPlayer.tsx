'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface PlayerTurn {
  speaker: 'rep' | 'caller'
  text: string
  startMs: number
  endMs: number
  audioPath?: string | null
}

export interface PlayerNote {
  timestamp: string
  issue: string
  evidence: string
}

function toMs(stamp: string): number {
  const [m, s] = stamp.split(':').map((n) => parseInt(n, 10))
  if (Number.isNaN(m)) return 0
  return (m * 60 + (s || 0)) * 1000
}

function mmss(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Plays the call back as one continuous recording.
 *
 * There is no single mixed audio file — the rep's turns are stored clips and
 * the caller's lines are re-spoken — so this stitches them: it walks the turns
 * in order, plays each source back to back, and keeps one timeline across the
 * whole thing. Feedback lands as a note that animates in when playback reaches
 * the moment it refers to, rather than as a list to cross-reference by hand.
 */
export default function CallPlayer({
  turns, notes, repName, voice,
}: { turns: PlayerTurn[]; notes: PlayerNote[]; repName?: string; voice?: string }) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [withinMs, setWithinMs] = useState(0)
  const [loading, setLoading] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const urls = useRef<Map<number, string>>(new Map())
  const railRef = useRef<HTMLDivElement | null>(null)

  // The timeline uses the durations recorded on the call, so note timestamps
  // line up with what the scorer saw.
  const offsets = useMemo(() => {
    let acc = 0
    return turns.map((t) => {
      const start = acc
      acc += Math.max(600, t.endMs - t.startMs)
      return start
    })
  }, [turns])
  const total = useMemo(
    () => offsets.length ? offsets[offsets.length - 1] + Math.max(600, turns[turns.length - 1].endMs - turns[turns.length - 1].startMs) : 0,
    [offsets, turns]
  )

  /** Note timestamps are call-clock; map them onto the stitched timeline. */
  const placed = useMemo(() => {
    return notes.map((n) => {
      const at = toMs(n.timestamp)
      let i = turns.findIndex((t) => at >= t.startMs && at <= t.endMs)
      if (i < 0) {
        i = turns.reduce((best, t, idx) => (Math.abs(t.startMs - at) < Math.abs(turns[best].startMs - at) ? idx : best), 0)
      }
      return { ...n, turnIndex: i, at: offsets[i] ?? 0 }
    }).sort((a, b) => a.at - b.at)
  }, [notes, turns, offsets])

  const elapsed = (offsets[index] ?? 0) + withinMs
  const activeNote = placed.filter((n) => n.turnIndex === index)

  const sourceFor = useCallback(async (i: number): Promise<string | null> => {
    const cached = urls.current.get(i)
    if (cached) return cached
    const t = turns[i]
    if (!t) return null
    let url: string | null = null
    if (t.speaker === 'rep') {
      if (!t.audioPath) return null
      const res = await fetch(`/api/venu/audio?path=${encodeURIComponent(t.audioPath)}`)
      if (res.ok) url = (await res.json()).url
    } else {
      // Re-spoken in the voice that caller actually had on the call.
      const v = voice ? `&voice=${encodeURIComponent(voice)}` : ''
      url = `/api/venu/tts?text=${encodeURIComponent(t.text)}${v}`
    }
    if (url) urls.current.set(i, url)
    return url
  }, [turns, voice])

  const playFrom = useCallback(async (i: number) => {
    if (i >= turns.length) { setPlaying(false); setIndex(0); setWithinMs(0); return }
    setIndex(i)
    setWithinMs(0)
    setLoading(true)

    const url = await sourceFor(i)
    setLoading(false)
    if (!url) { void playFrom(i + 1); return } // no stored audio for this turn

    const el = audio.current ?? new Audio()
    audio.current = el
    el.src = url
    el.onended = () => { void playFrom(i + 1) }
    el.onerror = () => { void playFrom(i + 1) }
    el.ontimeupdate = () => setWithinMs(el.currentTime * 1000)
    try { await el.play(); setPlaying(true) } catch { setPlaying(false) }

    // Warm the next clip so the stitch doesn't gap.
    void sourceFor(i + 1)
  }, [sourceFor, turns.length])

  const toggle = useCallback(() => {
    const el = audio.current
    if (playing && el) { el.pause(); setPlaying(false); return }
    if (el && el.src && el.currentTime > 0 && !el.ended) { void el.play(); setPlaying(true); return }
    void playFrom(index)
  }, [playing, playFrom, index])

  useEffect(() => () => { audio.current?.pause() }, [])

  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLElement>(`[data-turn="${index}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [index])

  return (
    <div className="venu-player">
      <div className="venu-player-bar">
        <button className="venu-player-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play the call'}>
          {loading ? '…' : playing ? '❚❚' : '▶'}
        </button>

        <div className="venu-player-track" role="presentation">
          <div className="venu-player-fill" style={{ width: total ? `${Math.min(100, (elapsed / total) * 100)}%` : '0%' }} />
          {placed.map((n, i) => (
            <button
              key={i}
              className={`venu-player-pin${elapsed >= n.at ? ' passed' : ''}`}
              style={{ left: total ? `${(n.at / total) * 100}%` : '0%' }}
              title={n.issue}
              onClick={() => playFrom(n.turnIndex)}
              aria-label={`Jump to ${n.timestamp}`}
            />
          ))}
        </div>

        <span className="venu-player-time">{mmss(elapsed)} / {mmss(total)}</span>
      </div>

      <p className="venu-player-hint">
        Plays the whole call end to end. Dots are the moments the scorer flagged — click one to jump.
      </p>

      <div className="venu-player-rail" ref={railRef}>
        {turns.map((t, i) => (
          <div key={i} data-turn={i} className={`venu-play-row ${t.speaker}${i === index ? ' is-current' : ''}`}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="who">
                {mmss(t.startMs)} · {t.speaker === 'rep' ? (repName || 'You') : 'Caller'}
                {t.speaker === 'rep' && !t.audioPath && <em style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> · no audio stored</em>}
              </span>
              {t.text}
            </span>
            {i === index && activeNote.map((n, k) => (
              <span key={k} className="venu-note-pop">
                <strong>{n.issue}</strong>
                {n.evidence && <span>{n.evidence}</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
