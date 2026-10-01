'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { ProsodyMeter } from '@/app/venu/_lib/prosody'
import {
  SHIFTS, PAY_TABLE, CLOSING, STATUS_LABEL, MIN_ANSWER_MS, turnsOf, type CandidateStatus,
} from '@/app/venu/_lib/candidates'

/* ═══════════════════════════════════════════════════════════════════════════
   The interview, as a conversation.

   Venu asks, the candidate answers, Venu moves on — no buttons in between.
   The mic opens once at the start and stays open for the whole call; silence
   is what ends a turn, the same way it does on a real one.

   Two numbers differ sharply from the roleplay client, on purpose. Silence has
   to run much longer here (the roleplay ends a turn at 330ms) because someone
   being interviewed pauses to think mid-answer, and cutting them off costs the
   very answer we asked for. And the mic is half-duplex against Venu's own
   voice, or her question ends up recorded as part of their answer.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Quiet for this long and the answer is over. */
const SILENCE_MS = 2600
/** Speech has to clear the room by this much to start an answer. */
const SPEECH_START_OVER_FLOOR_DB = 12
/** Lower, so a quiet syllable mid-sentence does not end the turn. */
const SPEECH_CONTINUE_OVER_FLOOR_DB = 8
/** Hard stop so one answer cannot run forever. */
const MAX_ANSWER_MS = 150_000

type Recording = { path: string; ms: number }
type Candidate = {
  name: string
  status: CandidateStatus
  answers: Record<string, string>
  recordings: Record<string, Recording>
  phone: string | null
  reviewNote: string | null
  teamLoginEmail: string | null
}

type Line = { who: 'venu' | 'you'; text: string; pending?: boolean; card?: 'shifts' | 'pay' }
type Stage = 'ready' | 'starting' | 'intro' | 'asking' | 'listening' | 'saving' | 'phone' | 'done'

export default function VoiceInterview() {
  const { token } = useParams<{ token: string }>()
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [stage, setStage] = useState<Stage>('ready')
  const [feed, setFeed] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState('')
  /* The box opens by itself when Venu asks. This is the way back to it if she
     asks in a form we did not recognise — a candidate who has said their
     number out loud and seen nothing happen needs somewhere to put it. */
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const meterRef = useRef<ProsodyMeter | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  /** A second recorder that runs for the whole call, start to finish. */
  const callRecorderRef = useRef<MediaRecorder | null>(null)
  const callChunksRef = useRef<Blob[]>([])
  const chunksRef = useRef<Blob[]>([])
  const vadRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const floorDb = useRef(-60)
  const speakingRef = useRef(false)
  const recordingRef = useRef(false)
  const startedRef = useRef(0)
  const lastVoiceRef = useRef(0)
  const endedRef = useRef(false)
  /** True when the page was reloaded partway through a call. */
  const resumingRef = useRef(false)

  const say = useCallback((who: 'venu' | 'you', text: string) =>
    setFeed(f => [...f, { who, text }]), [])

  const load = useCallback(async () => {
    const res = await fetch(`/api/venu/candidates/${token}`)
    if (!res.ok) { setError('This link is no longer valid.'); setLoading(false); return }
    const { candidate: c } = await res.json()
    setCandidate(c)
    setPhone(c.phone ?? '')
    /* Put the call back on screen after a refresh. The server has kept every
       turn; without this the candidate comes back to a blank page and no idea
       whether anything they said was heard. */
    const prior = turnsOf(c)
    if (prior.length) {
      setFeed(prior.map(t => ({
        who: t.who === 'venu' ? ('venu' as const) : ('you' as const),
        text: t.text,
        card: t.card,
      })))
      resumingRef.current = true
    }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  // Tear the mic down whatever way the page goes away.
  useEffect(() => () => {
    endedRef.current = true
    if (vadRef.current) clearInterval(vadRef.current)
    meterRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  /** Venu speaks the turn the server just wrote, and resolves when done. */
  const speak = useCallback((index: number) => new Promise<void>(resolve => {
    const el = audioRef.current
    if (!el) return resolve()
    speakingRef.current = true
    el.src = `/api/venu/candidates/${token}/voice?turn=${index}&t=${Date.now()}`
    const done = () => { speakingRef.current = false; resolve() }
    el.onended = done
    el.onerror = done
    el.play().catch(done)
  }), [token])

  /** Stop the whole-call recorder and put the file where a reviewer can play it.

      Called from more than one place on purpose. The interview used to save
      only when the model remembered to mark the close, so an interview that
      ended any other way — abandoned, errored, or simply unmarked — left no
      audio at all. It now also saves when the number is submitted and when
      the page goes away. */
  const savingRef = useRef(false)
  const savedRef = useRef(false)

  const saveCallRecording = useCallback(async () => {
    const rec = callRecorderRef.current
    if (!rec || rec.state === 'inactive') return
    // Two save points can fire close together; the second must not upload a
    // second copy or race the first.
    if (savingRef.current || savedRef.current) return
    savingRef.current = true

    const blob: Blob = await new Promise(resolve => {
      rec.addEventListener('stop', () => resolve(new Blob(callChunksRef.current, { type: rec.mimeType || 'audio/webm' })), { once: true })
      rec.stop()
    })
    if (!blob.size) { savingRef.current = false; return }

    try {
      const startRes = await fetch(`/api/venu/candidates/${token}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'interview.webm', size: blob.size }),
      })
      const start = await startRes.json()
      if (!startRes.ok) throw new Error(start.error)

      const put = await fetch(start.signedUrl, {
        method: 'PUT', body: blob, headers: { 'content-type': blob.type || 'audio/webm' },
      })
      if (!put.ok) throw new Error('upload rejected')

      await fetch(`/api/venu/candidates/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingPath: start.path, recordingName: 'interview.webm' }),
      })
      savedRef.current = true
      callRecorderRef.current = null
    } catch (e) {
      /* The transcript is already saved; losing the audio must not cost them
         the interview, so this is reported to us and not to the candidate.
         The recorder is deliberately left in place so a later save point can
         try again — nulling it here is what made the first failure final. */
      console.error('[venu:apply] call recording upload failed', e)
    } finally {
      savingRef.current = false
    }
  }, [token])

  /* A closed tab is the most common way an interview ends early, and it used
     to take the recording with it. Saving on pagehide keeps whatever was
     captured; visibilitychange covers mobile, where pagehide is unreliable. */
  useEffect(() => {
    const flush = () => { void saveCallRecording() }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [saveCallRecording])


  /** Send what they said, get Venu's reply, speak it, listen again. */
  const exchange = useCallback(async (audio: Blob | null, ms: number) => {
    const res = await fetch(`/api/venu/candidates/${token}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm', 'x-utterance-ms': String(ms) },
      body: audio ?? new Blob([]),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Venu dropped off. Refresh and pick up where you left off.')
    return data as {
      reply: string; transcript?: string; index: number; done: boolean
      card?: 'shifts' | 'pay'; retry?: boolean
    }
  }, [token])

  /** The call itself: one exchange after another until she asks for a number. */
  const converse = useCallback(async () => {
    let audio: Blob | null = null
    let ms = 0

    // Coming back mid-call, Venu has already asked something — listen first
    // rather than sending her an empty turn she can only answer with "sorry?".
    if (resumingRef.current) {
      resumingRef.current = false
      setStage('listening')
      const heard = await listen()
      audio = heard.blob
      ms = heard.ms
    }

    while (!endedRef.current) {
      setStage('saving')
      if (audio) setFeed(f => [...f, { who: 'you', text: '…', pending: true }])

      let turn
      try {
        turn = await exchange(audio, ms)
      } catch (e: any) {
        setFeed(f => f.filter(l => !l.pending))
        setError(e.message)
        return
      }

      setFeed(f => {
        const next = f.filter(l => !l.pending)
        if (turn.transcript) next.push({ who: 'you', text: turn.transcript })
        next.push({ who: 'venu', text: turn.reply, card: turn.card })
        return next
      })

      setStage('asking')
      await speak(turn.index)
      if (endedRef.current) return

      if (turn.done) {
        setStage('phone')
        void saveCallRecording()
        return
      }

      setStage('listening')
      const heard = await listen()
      audio = heard.blob
      ms = heard.ms
    }
  }, [exchange, speak])

  /** Resolves with the answer once the room has been quiet long enough. */
  function listen(): Promise<{ blob: Blob; ms: number }> {
    return new Promise(resolve => {
      const stream = streamRef.current!
      const meter = meterRef.current!
      let peakDb = -25

      const finish = async () => {
        if (vadRef.current) clearInterval(vadRef.current)
        vadRef.current = null
        const rec = recorderRef.current
        const ms = Date.now() - startedRef.current
        if (!rec || rec.state === 'inactive') return resolve({ blob: new Blob(chunksRef.current, { type: 'audio/webm' }), ms })
        const blob: Blob = await new Promise(r => {
          rec.addEventListener('stop', () => r(new Blob(chunksRef.current, { type: 'audio/webm' })), { once: true })
          rec.stop()
        })
        recordingRef.current = false
        resolve({ blob, ms })
      }

      vadRef.current = setInterval(() => {
        if (endedRef.current) return
        // Half duplex — never record Venu's own voice off the speakers.
        if (speakingRef.current) return

        const db = meter.currentDb()
        const t = Date.now()
        setLevel(Math.max(0, Math.min(1, (db - floorDb.current) / 40)))

        if (!recordingRef.current) {
          // Learn the room: drop fast to a new quiet level, creep up slowly.
          floorDb.current = db < floorDb.current
            ? db
            : floorDb.current * 0.98 + Math.min(db, floorDb.current + 6) * 0.02
        } else if (db > peakDb) {
          peakDb = db
        }

        const startAt = floorDb.current + SPEECH_START_OVER_FLOOR_DB
        const keepAt = Math.max(floorDb.current + SPEECH_CONTINUE_OVER_FLOOR_DB, peakDb - 22)

        if (!recordingRef.current && db > startAt) {
          recordingRef.current = true
          startedRef.current = t
          lastVoiceRef.current = t
          chunksRef.current = []
          const rec = new MediaRecorder(stream, recorderOptions())
          rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
          rec.start(250)
          recorderRef.current = rec
          return
        }

        if (recordingRef.current) {
          if (db > keepAt) lastVoiceRef.current = t
          const quietFor = t - lastVoiceRef.current
          const spokenFor = t - startedRef.current
          if ((quietFor > SILENCE_MS && spokenFor > MIN_ANSWER_MS) || spokenFor > MAX_ANSWER_MS) {
            void finish()
          }
        }
      }, 100)
    })
  }

  /* Getting the microphone is the one step that can stall with nothing on
     screen: the browser shows its permission prompt out of band, and if the
     candidate misses it — or the page is not on a secure origin, where
     mediaDevices does not exist at all — the promise simply never settles.
     A button that silently does nothing reads as broken, so this reports
     every one of those states instead of waiting quietly. */
  async function begin() {
    setError('')
    setStage('starting')

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? 'This browser will not give a page access to the microphone. Try Chrome, Edge or Safari.'
          : 'Your browser only allows microphone access over a secure connection. Open this page on https, or on localhost.'
      )
      setStage('ready')
      return
    }

    let stream: MediaStream
    try {
      stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({ audio: true }),
        15_000,
      )
    } catch (e: any) {
      const name = e?.name ?? ''
      setError(
        name === 'timeout'      ? 'Still waiting for microphone access — look for the prompt near your address bar and choose Allow.'
        : name === 'NotAllowedError'  ? 'Microphone access was blocked. Allow it for this site (the icon in the address bar) and press start again.'
        : name === 'NotFoundError'    ? 'No microphone found. Plug one in, or switch to a device with one, then press start again.'
        : name === 'NotReadableError' ? 'Another app is using your microphone. Close it and press start again.'
        : 'We could not reach your microphone. Allow access and try again.'
      )
      setStage('ready')
      return
    }

    try {
      streamRef.current = stream
      const meter = new ProsodyMeter()
      const t0 = Date.now()
      meter.start(stream, () => Date.now() - t0)
      meterRef.current = meter

      /* One recording of the whole interview. The per-utterance capture below
         exists only to feed transcription — what gets reviewed is the call,
         not a pile of four-second answers. */
      callChunksRef.current = []
      const callRec = new MediaRecorder(stream, recorderOptions())
      callRec.ondataavailable = e => { if (e.data.size) callChunksRef.current.push(e.data) }
      callRec.start(2000)
      callRecorderRef.current = callRec

      await converse()
    } catch (e: any) {
      setError(e?.message || 'The call could not start. Refresh and try again.')
      setStage('ready')
    }
  }

  async function submitPhone() {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/venu/candidates/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save your number.')
      setCandidate(data.candidate)
      setPhoneOpen(false)

      /* Opened early, this is just a number being filed — the interview is
         still going and must not be hung up on the candidate mid-answer. Only
         the real close ends the call. */
      if (stage !== 'phone') return

      setStage('done')
      say('venu', CLOSING[1])
      endedRef.current = true
      await saveCallRecording()
      streamRef.current?.getTracks().forEach(t => t.stop())
      meterRef.current?.stop()
    } catch (e: any) {
      setError(e.message)
    } finally { setBusy(false) }
  }

  if (loading) return <Shell><p className="venu-sub">Loading…</p></Shell>
  if (!candidate) return (
    <Shell><h1 className="venu-h2">Link not found</h1>
      <p className="venu-sub">{error || 'Start again from the link you were sent.'}</p></Shell>
  )

  if (candidate.status !== 'invited' && stage !== 'done') return <Finished candidate={candidate} audioRef={audioRef} />
  if (stage === 'done') return <Finished candidate={candidate} audioRef={audioRef} />

  return (
    <Shell>
      <audio ref={audioRef} hidden />

      {stage === 'ready' || stage === 'starting' ? (
        <>
          {/* Coming back to a call already in progress: show what was said
              before the button, so it is obvious nothing was lost. */}
          {feed.length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <Feed lines={feed} />
            </div>
          )}
          <p className="venu-eyebrow">Voice interview</p>
          <h1 className="venu-h1" style={{ fontSize: 26, marginBottom: 14 }}>
            {feed.length ? 'Ready when you are' : 'Venu will interview you now'}
          </h1>
          {feed.length ? (
            <p className="venu-sub" style={{ marginBottom: 18 }}>
              Your answers so far are saved. Press below and Venu will listen for the rest.
            </p>
          ) : (
            <>
              <p className="venu-sub" style={{ marginBottom: 10 }}>
                It runs like a phone call. Venu asks, you answer out loud, and she moves on when
                you have finished — there is nothing to press.
              </p>
              <p className="venu-sub" style={{ marginBottom: 18 }}>
                Find a quiet spot, use headphones if you have them, and allow microphone access.
              </p>
            </>
          )}
          <button className="venu-btn" onClick={begin} disabled={stage === 'starting'}>
            {stage === 'starting' ? 'Waiting for your microphone…'
              : feed.length ? 'Pick the call back up →' : 'Start the call →'}
          </button>
          {stage === 'starting' && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              Your browser is asking for permission — choose <b>Allow</b>.
            </p>
          )}
        </>
      ) : (
        <>
          <Status stage={stage} level={level} />
          <Feed lines={feed} />

          {stage === 'listening' && (
            <p style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
              Take your time — a pause is fine. Venu carries on when you are done.
            </p>
          )}

          {(stage === 'phone' || phoneOpen) && (
            <div className="venu-card" style={{ padding: 24, marginTop: 20 }}>
              <label className="venu-label" htmlFor="phone">Your phone number</label>
              <input id="phone" className="venu-input" inputMode="tel" autoComplete="tel" autoFocus
                value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>
                Include your country code — we message candidates on WhatsApp.
              </p>
              <button className="venu-btn" style={{ width: '100%', marginTop: 16 }}
                onClick={submitPhone} disabled={phone.replace(/\D/g, '').length < 7 || busy}>
                {busy ? 'Sending…' : 'Send my number'}
              </button>
            </div>
          )}

          {stage !== 'phone' && !phoneOpen && (
            <p style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                onClick={() => setPhoneOpen(true)}
                style={{
                  border: 0, background: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 11.5, color: 'var(--muted)', textDecoration: 'underline',
                }}>
                Asked for your number? Add it here
              </button>
            </p>
          )}

        </>
      )}

      {error && <div className="venu-note" style={{ borderColor: '#f0c4c0', marginTop: 16 }}>{error}</div>}
    </Shell>
  )
}

/** Reject with a named error rather than hanging when a prompt goes unanswered. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('timed out'), { name: 'timeout' })), ms)),
  ])
}

/** webm everywhere it exists; Safari records mp4 and nothing else. */
function recorderOptions(): MediaRecorderOptions {
  for (const mimeType of ['audio/webm', 'audio/mp4']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(mimeType)) return { mimeType }
  }
  return {}
}

function Status({ stage, level }: { stage: Stage; level: number }) {
  const label = stage === 'listening' ? 'Listening'
    : stage === 'saving' ? 'One moment'
    : stage === 'phone' ? 'Almost done'
    : 'Venu is speaking'
  return (
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <span style={{
        display: 'inline-block', width: 60, height: 60, borderRadius: '50%',
        background: stage === 'listening' ? '#1b7a4b' : 'var(--ink, #1b1714)',
        transform: `scale(${stage === 'listening' ? 1 + level * 0.35 : 1})`,
        transition: 'transform .12s ease-out, background .3s',
      }} />
      <p className="venu-eyebrow" style={{ marginTop: 12 }}>{label}</p>
    </div>
  )
}

function Feed({ lines }: { lines: Line[] }) {
  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ textAlign: l.who === 'you' ? 'right' : 'left' }}>
          <p className="venu-eyebrow" style={{ marginBottom: 4 }}>{l.who === 'venu' ? 'Venu' : 'You'}</p>
          <p style={{
            display: 'inline-block', maxWidth: '86%', textAlign: 'left',
            fontSize: 14, lineHeight: 1.55, padding: '10px 14px', borderRadius: 12,
            background: l.who === 'you' ? 'var(--ink, #1b1714)' : 'rgba(255,255,255,.6)',
            color: l.who === 'you' ? '#fff' : 'inherit',
            border: l.who === 'you' ? 0 : '1px solid var(--line)',
            opacity: l.pending ? 0.55 : 1,
          }}>{l.text}</p>
          {l.card === 'shifts' && <ShiftCard />}
          {l.card === 'pay' && <PayCard />}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

/* Shown under the line that introduces them, because a list of times or rates
   is far easier to read than to listen to — which is also why Venu no longer
   says either out loud. */

function ShiftCard() {
  return (
    <div className="venu-card" style={{ padding: 18, marginTop: 10, textAlign: 'left' }}>
      <p className="venu-eyebrow" style={{ marginBottom: 10 }}>Shifts · Pacific time</p>
      {SHIFTS.hr.map(s => <ShiftRow key={s.name} {...s} />)}
      <p className="venu-eyebrow" style={{ margin: '14px 0 10px' }}>Training</p>
      {SHIFTS.training.map(s => <ShiftRow key={s.name} {...s} />)}
      <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 12 }}>
        Weekends are available on every shift — Venu will ask if you can work them.
      </p>
    </div>
  )
}

function PayCard() {
  return (
    <div className="venu-card" style={{ padding: 18, marginTop: 10, textAlign: 'left' }}>
      <p className="venu-eyebrow" style={{ marginBottom: 10 }}>How the pay works</p>
      {PAY_TABLE.map(row => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '7px 0', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 600, fontSize: 13, minWidth: 86 }}>{row.label}</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.02em' }}>{row.value}</span>
          {row.note && <span style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 11.5, color: 'var(--muted)', maxWidth: 210 }}>{row.note}</span>}
        </div>
      ))}
    </div>
  )
}

function ShiftRow({ name, window: w, hours }: { name: string; window: string; hours: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 0', fontSize: 13.5 }}>
      <span style={{ fontWeight: 600, minWidth: 82 }}>{name}</span>
      <span style={{ color: 'var(--muted)' }}>{w}</span>
      <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>{hours}</span>
    </div>
  )
}

function Finished({ candidate, audioRef }: { candidate: Candidate; audioRef: React.RefObject<HTMLAudioElement | null> }) {
  return (
    <Shell>
      <audio ref={audioRef} hidden />
      <p className="venu-eyebrow">Case Bridge</p>
      <h1 className="venu-h1" style={{ fontSize: 28 }}>
        {candidate.status === 'not_qualified' ? 'Thank you for your time' : `Thank you, ${candidate.name.split(' ')[0]}`}
      </h1>
      {candidate.status === 'not_qualified' ? (
        <p className="venu-sub">We are not moving forward this time.{candidate.reviewNote ? ` ${candidate.reviewNote}` : ''}</p>
      ) : (
        <>
          <p className="venu-sub">{CLOSING[1]}</p>
          <div className="venu-note" style={{ marginTop: 18 }}>
            <b>{STATUS_LABEL[candidate.status]}</b>
            {candidate.status === 'submitted' && ` — we are listening back to your interview and will message ${candidate.phone}.`}
            {candidate.status === 'qualified' && ' — welcome aboard. Watch WhatsApp for your group invite.'}
            {candidate.status === 'onboarded' && candidate.teamLoginEmail &&
              ' — your Team Center account is ready. Sign in with your name and the password we sent you.'}
          </div>
        </>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="venu-wrap" style={{ maxWidth: 620, margin: '0 auto', padding: '36px 20px 90px' }}>
      {children}
    </main>
  )
}
