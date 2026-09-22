'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ProsodyMeter, type TurnProsody } from '../_lib/prosody'

interface CheckpointView { id: string; label: string; complete: string }

interface Lead {
  firstName: string; lastName: string; phone: string; email: string
  accidentWindow: string; lawyerHandling: string; state: string
  injuryOption: string; atFault: string
}

interface Turn {
  speaker: 'rep' | 'caller'
  text: string
  startMs: number
  endMs: number
  prosody?: TurnProsody | null
  audioPath?: string | null
}

type BotState = 'idle' | 'listening' | 'hearing' | 'thinking' | 'speaking'
type Phase = 'ready' | 'connecting' | 'live' | 'wrapping'

const MAX_REP_TURNS = 45
/** Silence that ends the rep's turn. Mid-sentence pauses run 200-500ms, so this
 *  is about as tight as it goes before the rep gets cut off mid-thought. */
const SILENCE_MS = 230
/** Speech has to clear the room by this much to start a turn. */
const SPEECH_START_OVER_FLOOR_DB = 12
/** Slightly lower to keep a turn going, so a quiet syllable doesn't split it.
 *  Kept close to the start threshold — a wide gap is what makes a turn hang
 *  open on room tone long after the rep stopped talking. */
const SPEECH_CONTINUE_OVER_FLOOR_DB = 9
/** Anything this far below the rep's own recent speech level is silence,
 *  whatever the floor estimate says. Backstop for a bad floor. */
const BELOW_PEAK_IS_SILENCE_DB = 22
/** Hard stop so one long answer can't run forever. */
const MAX_UTTERANCE_MS = 15000
/**
 * Played slightly under speed with pitch correction off, which drops the voice
 * about a semitone and unhurries it. Aura exposes no pitch or rate control and
 * no emotion parameter, so this is the only handle on how heavy the delivery
 * sounds once the words and the voice are already chosen.
 */
const PLAYBACK_RATE = 0.94

/**
 * Nothing in the start path may await without a deadline. A silently dropped
 * websocket, a microphone request the OS never answers, or an audio element
 * that never fires `ended` all present identically to the rep: a screen stuck
 * on "Starting…". A timeout turns each of those into a sentence they can act on.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export default function CallClient({
  mode, checkpoints,
}: { mode: 'practice' | 'test'; checkpoints: CheckpointView[] }) {
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>('ready')
  const [bot, setBot] = useState<BotState>('idle')
  const [turns, setTurns] = useState<Turn[]>([])
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [lead, setLead] = useState<Lead | null>(null)
  const voice = useRef('aura-2-athena-en')

  const t0 = useRef(0)
  const sessionId = useRef('')
  const micStream = useRef<MediaStream | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const turnsRef = useRef<Turn[]>([])
  const botBusy = useRef(false)
  const ended = useRef(false)
  const prosody = useRef<ProsodyMeter | null>(null)
  const firstAudioAt = useRef(0)

  // Voice-activity state
  const vadTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const recording = useRef(false)
  /** The in-flight upload of the most recent slice. */
  const lastChunkUp = useRef<Promise<unknown>>(Promise.resolve())
  const lastVoiceAt = useRef(0)
  const utteranceStart = useRef(0)
  /** Room tone, learned only while nobody is speaking. */
  const floorDb = useRef(-60)
  /** Loudest recent speech, for the relative-silence backstop. */
  const peakDb = useRef(-25)
  const lastVadLog = useRef(0)

  const now = () => Math.round(performance.now() - t0.current)

  const pushTurn = useCallback((t: Turn) => {
    turnsRef.current = [...turnsRef.current, t]
    setTurns(turnsRef.current)
  }, [])

  useEffect(() => {
    if (phase !== 'live') return
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - t0.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase])

  const speak = useCallback(async (text: string) => {
    botBusy.current = true
    setBot('speaking')
    const startedAt = now()

    try {
      // Streamed straight into the element: Deepgram begins returning audio in
      // ~250ms but takes ~3s to finish a sentence, so buffering the whole clip
      // would add three seconds of silence to every turn.
      const el = audio.current ?? new Audio()
      audio.current = el
      el.src = `/api/venu/tts?text=${encodeURIComponent(text)}&voice=${voice.current}`
      // preservesPitch off means the rate change carries the pitch down with it.
      el.preservesPitch = false
      ;(el as any).mozPreservesPitch = false
      ;(el as any).webkitPreservesPitch = false
      el.playbackRate = PLAYBACK_RATE
      await el.play()
      firstAudioAt.current = performance.now()
      await new Promise<void>((resolve) => {
        el.onended = () => resolve()
        el.onerror = () => resolve()
        // Roughly 80ms of speech per character, with generous headroom — a
        // stalled audio stream must not freeze the call.
        setTimeout(resolve, Math.min(45000, 4000 + text.length * 80))
      })
    } catch {
      // No voice is better than a dead call — the line still shows in the rail.
    }

    pushTurn({ speaker: 'caller', text, startMs: startedAt, endMs: now() })
    setTimeout(() => {
      botBusy.current = false
      if (!ended.current) setBot('listening')
    }, 250)
  }, [pushTurn])

  /** End the current utterance now, whatever the detector thinks. */
  const endTurnNow = useCallback(() => {
    if (!recording.current) return
    recording.current = false
    peakDb.current = -25
    try { recorder.current?.stop() } catch {}
  }, [])

  const stopCapture = useCallback(() => {
    if (vadTimer.current) clearInterval(vadTimer.current)
    vadTimer.current = null
    try { if (recorder.current?.state === 'recording') recorder.current.stop() } catch {}
    recording.current = false
  }, [])

  const finish = useCallback(async (endReason: string) => {
    if (ended.current) return
    ended.current = true
    setPhase('wrapping')
    setBot('idle')

    stopCapture()
    prosody.current?.stop()
    micStream.current?.getTracks().forEach((t) => t.stop())
    try { audio.current?.pause() } catch {}

    const res = await fetch('/api/venu/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId.current, turns: turnsRef.current, endReason }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Scoring failed.')
      setPhase('ready')
      ended.current = false
      return
    }

    router.push(`/venu/result/${sessionId.current}`)
  }, [router, stopCapture])

  /**
   * One finished utterance: transcribed and answered in a single round trip,
   * then spoken. Every millisecond here is the rep waiting in silence, so the
   * phases are timed and logged.
   */
  const sendUtterance = useCallback(async (blob: Blob, startMs: number, endMs: number) => {
    if (ended.current || blob.size < 2000) { if (!ended.current) setBot('listening'); return }
    setBot('thinking')
    const t0 = performance.now()

    try {
      const res = await fetch('/api/venu/say', {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'audio/webm',
          'x-session-id': sessionId.current,
          'x-utterance-ms': String(Math.max(0, endMs - startMs)),
        },
        body: blob,
      })
      if (!res.ok) throw new Error('say')
      const data = await res.json()
      const tSay = performance.now()

      if (!data.transcript || ended.current) { if (!ended.current) setBot('listening'); return }

      pushTurn({
        speaker: 'rep',
        text: data.transcript,
        startMs,
        endMs,
        prosody: prosody.current?.between(startMs, endMs) ?? null,
        audioPath: data.audioPath ?? null,
      })

      const tSpeak = performance.now()
      if (data.text) await speak(data.text)

      console.info(
        `[venu] turnaround ${Math.round(performance.now() - t0)}ms — ` +
        `say ${Math.round(tSay - t0)}ms (server: auth ${data.timing?.auth ?? '?'} stt ${data.timing?.stt ?? '?'} turn ${data.timing?.turn ?? '?'}), ` +
        `audio start ${Math.round(firstAudioAt.current - tSpeak)}ms`
      )

      if (data.endCall) await finish(data.endReason ?? 'hung_up')
      else if (turnsRef.current.filter((t) => t.speaker === 'rep').length >= MAX_REP_TURNS) {
        await finish('max_turns')
      }
    } catch {
      setError('Venu dropped off for a second. Keep talking — she\'ll pick back up.')
      setBot('listening')
    }
  }, [finish, pushTurn, speak])

  /**
   * Voice-activity detection off the same mic the prosody meter is reading.
   * Speech starts a recorder, silence ends it — which also means each utterance
   * is a complete, standalone webm rather than a mid-stream fragment.
   */
  const startCapture = useCallback((stream: MediaStream) => {
    vadTimer.current = setInterval(() => {
      const meter = prosody.current
      if (!meter || ended.current) return

      // Half duplex: ignore the mic while Venu is talking so her own voice
      // coming out of the speakers can't be transcribed as the rep.
      if (botBusy.current) {
        if (recording.current) {
          try { recorder.current?.stop() } catch {}
          recording.current = false
        }
        return
      }

      const db = meter.currentDb()
      const t = now()

      // Learn the room only when the rep is not mid-utterance. Drops fast to a
      // new quiet level, creeps up slowly, so one cough doesn't reset it.
      if (!recording.current) {
        floorDb.current = db < floorDb.current
          ? db
          : floorDb.current * 0.98 + Math.min(db, floorDb.current + 6) * 0.02
        peakDb.current = Math.max(peakDb.current - 0.05, -25)
      } else if (db > peakDb.current) {
        peakDb.current = db
      }

      const startAt = floorDb.current + SPEECH_START_OVER_FLOOR_DB
      const continueAt = Math.max(
        floorDb.current + SPEECH_CONTINUE_OVER_FLOOR_DB,
        peakDb.current - BELOW_PEAK_IS_SILENCE_DB
      )

      // One line a second while recording, so a room that behaves badly can be
      // diagnosed from the console instead of guessed at.
      if (recording.current && t - lastVadLog.current > 1000) {
        lastVadLog.current = t
        console.debug(
          `[venu:vad] ${Math.round(db)}dB  floor ${Math.round(floorDb.current)}  ` +
          `keep-going above ${Math.round(continueAt)}  quiet for ${t - lastVoiceAt.current}ms`
        )
      }

      if (!recording.current && db > startAt) {
        recording.current = true
        utteranceStart.current = t
        lastVoiceAt.current = t
        chunks.current = []
        try {
          const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
          recorder.current = rec
          rec.ondataavailable = (e) => {
            if (e.data.size === 0) return
            chunks.current.push(e.data)
            // Straight up to the live transcription socket. By the time the rep
            // stops talking, everything but the last slice is already
            // transcribed, which is the whole point.
            lastChunkUp.current = fetch('/api/venu/chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'audio/webm', 'x-session-id': sessionId.current },
              body: e.data,
            }).catch(() => {})
          }
          rec.onstop = () => {
            const blob = new Blob(chunks.current, { type: 'audio/webm' })
            const startedAt = utteranceStart.current
            const endedAt = now()
            // The final slice is emitted by stop() and is still uploading. Let
            // it land, or the flush asks Deepgram for a tail it never received.
            void Promise.race([
              lastChunkUp.current,
              new Promise((r) => setTimeout(r, 250)),
            ]).then(() => sendUtterance(blob, startedAt, endedAt))
          }
          rec.start(250)
          setBot('hearing')
        } catch {
          recording.current = false
        }
        return
      }

      if (recording.current) {
        if (db > continueAt) lastVoiceAt.current = t
        const quietFor = t - lastVoiceAt.current
        const tooLong = t - utteranceStart.current > MAX_UTTERANCE_MS
        if (quietFor > SILENCE_MS || tooLong) {
          if (tooLong) console.debug('[venu:vad] hit the max utterance length, sending')
          recording.current = false
          peakDb.current = -25
          try { recorder.current?.stop() } catch {}
        }
      }
    }, 50)
  }, [sendUtterance])

  const start = useCallback(async () => {
    setError('')
    setPhase('connecting')

    try {
      const sessionRes = await withTimeout(
        fetch('/api/venu/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        }),
        10000,
        'The server did not respond. Check that the app is still running and try again.'
      )
      if (!sessionRes.ok) {
        const d = await sessionRes.json().catch(() => ({}))
        throw new Error(d.error ?? 'Could not start the session.')
      }
      const session = await sessionRes.json()
      sessionId.current = session.sessionId
      setLead(session.lead ?? null)
      if (session.voice) voice.current = session.voice

      // Log what the browser thinks it has before asking, so a hang here is
      // diagnosable from the console rather than being a mystery.
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const inputs = devices.filter((d) => d.kind === 'audioinput')
        const perm = await navigator.permissions
          ?.query({ name: 'microphone' as PermissionName })
          .then((p) => p.state)
          .catch(() => 'unknown')
        console.info('[venu] %d audio input(s), mic permission: %s', inputs.length, perm)
        if (inputs.length === 0) {
          throw new Error('No microphone is available to this browser.')
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('No microphone')) throw e
        // enumerateDevices failing is not fatal — carry on and let the real
        // request produce the error.
      }

      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            // Deliberately off. Automatic gain rides the level up during
            // pauses, so room tone gets amplified to nearly speech volume and
            // the turn never appears to end.
            autoGainControl: false,
          },
        }),
        12000,
        'The microphone request was never answered. Check the mic icon in the address bar, ' +
        'and on a Mac check System Settings → Privacy & Security → Microphone for your browser.'
      )
      micStream.current = stream
      console.info('[venu] mic ok, %d track(s)', stream.getAudioTracks().length)

      t0.current = performance.now()

      const meter = new ProsodyMeter()
      if (!meter.start(stream, now)) {
        throw new Error('This browser will not let us read the microphone.')
      }
      prosody.current = meter

      startCapture(stream)
      setPhase('live')
      void speak(session.opener)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start the call.'
      setError(
        message.includes('Permission') || message.includes('denied')
          ? 'Microphone permission is blocked for this site. Allow it and start again.'
          : message
      )
      micStream.current?.getTracks().forEach((t) => t.stop())
      setPhase('ready')
    }
  }, [mode, speak, startCapture])

  useEffect(() => {
    if (phase !== 'live') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      e.preventDefault()
      endTurnNow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, endTurnNow])

  useEffect(() => () => {
    stopCapture()
    prosody.current?.stop()
    micStream.current?.getTracks().forEach((t) => t.stop())
  }, [stopCapture])

  const status =
    phase === 'connecting' ? 'Starting…'
    : phase === 'wrapping' ? 'Scoring your call…'
    : bot === 'speaking' ? 'Caller is talking'
    : bot === 'hearing' ? 'Hearing you…'
    : bot === 'thinking' ? '…'
    : bot === 'listening' ? 'Listening'
    : 'Ready when you are'

  const lastCaller = [...turns].reverse().find((t) => t.speaker === 'caller')

  return (
    <main className="venu-wrap" style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link href="/venu" className="venu-eyebrow" style={{ textDecoration: 'none' }}>← Back</Link>
        <span className={`venu-mode-tag ${mode}`}>{mode}</span>
      </div>

      {error && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 22, alignItems: 'start' }}>
        <div className="venu-card venu-stage">
          <div className={`venu-orb lg${bot === 'speaking' ? ' is-speaking' : ''}${bot === 'listening' || bot === 'hearing' ? ' is-listening' : ''}${bot === 'thinking' ? ' is-thinking' : ''}`} />

          <div className="venu-status" style={{ justifyContent: 'center' }}>
            {phase === 'live' && <i className="venu-live-dot" />}
            {status}
            {phase === 'live' && ` · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}
          </div>

          <div className="venu-caption">
            {phase === 'ready' ? (
              <span style={{ color: 'var(--muted)', fontSize: 16 }}>
                Venu answers as the caller. You&rsquo;re the setter — introduce yourself and qualify the case.
              </span>
            ) : (lastCaller?.text ?? '')}
          </div>

          {phase === 'ready' && (
            <button className="venu-btn" onClick={() => { void start() }}>Start the call</button>
          )}
          {phase === 'connecting' && <button className="venu-btn" disabled>Starting…</button>}
          {phase === 'live' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              {bot === 'hearing' && (
                <button className="venu-btn ghost" onClick={endTurnNow}>
                  Done speaking <span style={{ opacity: 0.55, fontWeight: 500 }}>(space)</span>
                </button>
              )}
              <button className="venu-btn danger" onClick={() => finish('ended_by_rep')}>End call &amp; score</button>
            </div>
          )}
          {phase === 'wrapping' && <button className="venu-btn" disabled>Scoring…</button>}

          {turns.length > 0 && (
            <details className="venu-transcript-toggle">
              <summary>Transcript ({turns.length})</summary>
              <div className="venu-rail" style={{ border: 0, boxShadow: 'none', padding: '12px 0 0' }}>
                {turns.map((t, i) => (
                  <div key={i} className={`venu-line ${t.speaker}`}>
                    <span className="who">{t.speaker === 'rep' ? 'You' : 'Caller'}</span>
                    {t.text}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {lead ? (
          <aside className="venu-card" style={{ padding: 18 }}>
            <p className="venu-eyebrow" style={{ marginBottom: 4 }}>Form submission</p>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 12 }}>
              What they submitted before the call. Self-reported — verify it.
            </p>
            <div className="venu-lead-name">{lead.firstName} {lead.lastName}</div>
            <div className="venu-lead-row"><span>Phone</span><span>{lead.phone}</span></div>
            <div className="venu-lead-row"><span>Email</span><span style={{ overflowWrap: 'anywhere' }}>{lead.email}</span></div>
            <div className="venu-lead-row"><span>Accident</span><span>{lead.accidentWindow}</span></div>
            <div className="venu-lead-row"><span>Lawyer already?</span><span>{lead.lawyerHandling}</span></div>
            <div className="venu-lead-row"><span>State</span><span>{lead.state}</span></div>
            <div className="venu-lead-row"><span>Injury</span><span>{lead.injuryOption}</span></div>
            <div className="venu-lead-row"><span>At fault?</span><span>{lead.atFault}</span></div>
          </aside>
        ) : phase === 'ready' ? (
          <aside className="venu-card" style={{ padding: 18 }}>
            <p className="venu-eyebrow" style={{ marginBottom: 8 }}>Form submission</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              The lead&rsquo;s details appear here when the call starts — the same form you&rsquo;d
              have open on a real one.
            </p>
          </aside>
        ) : null}

        {mode === 'practice' && (
          <aside className="venu-card" style={{ padding: 18 }}>
            <p className="venu-eyebrow" style={{ marginBottom: 12 }}>The eight checkpoints</p>
            {checkpoints.map((c, i) => (
              <div key={c.id} className="venu-check" title={c.complete}>
                <span className="venu-check-num">{i + 1}</span>
                <span>{c.label}</span>
              </div>
            ))}
            <p className="venu-note" style={{ marginTop: 14 }}>
              Cover all eight — and find the one detail that decides this case. It won&rsquo;t be offered.
            </p>
          </aside>
        )}
        </div>
      </div>
    </main>
  )
}
