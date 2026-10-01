'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import CallPlayer from './CallPlayer'

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
  voice?: string
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
          <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
            {data && (
              <Link
                href={`/venu/result/${data.id}`}
                className="venu-drawer-close"
                aria-label="Open full screen"
                title="Full screen"
                style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}
              >
                ⤢
              </Link>
            )}
            <button className="venu-drawer-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
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
                Listen back — {mmss((data.durationSec ?? 0) * 1000)}
              </p>
              <CallPlayer
                turns={data.transcript}
                notes={card?.flaggedMoments ?? []}
                repName={data.repName}
                voice={data.voice}
              />
            </section>
          )}

          {data && (
            <Link href={`/venu/result/${data.id}`} className="venu-btn" style={{ alignSelf: 'flex-start' }}>
              Open the full report →
            </Link>
          )}
        </div>
      </aside>
    </>
  )
}
