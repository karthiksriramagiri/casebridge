'use client'

import { useEffect, useRef } from 'react'

// ── Melodic ringtone via Web Audio API ───────────────────────────────────────
// Plays a repeating 4-note melody instead of a flat beep.
// Suppressed when the rep is already on an active call.

interface RingtoneHandle {
  stop: () => void
}

function createRingtone(): RingtoneHandle {
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0.18
  master.connect(ctx.destination)

  let stopped = false
  let timer: ReturnType<typeof setTimeout>

  // Melody notes (Hz) — pleasant ascending pattern
  const melody = [
    { freq: 523.25, dur: 200 }, // C5
    { freq: 659.25, dur: 200 }, // E5
    { freq: 783.99, dur: 200 }, // G5
    { freq: 1046.5, dur: 400 }, // C6 (held longer)
  ]

  function playSequence() {
    if (stopped) return
    let offset = 0
    for (const note of melody) {
      const noteTimer = setTimeout(() => {
        if (stopped) return
        const osc = ctx.createOscillator()
        const env = ctx.createGain()
        osc.frequency.value = note.freq
        osc.type = 'sine'
        env.gain.setValueAtTime(0, ctx.currentTime)
        env.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.03)
        env.gain.linearRampToValueAtTime(0, ctx.currentTime + note.dur / 1000)
        osc.connect(env).connect(master)
        osc.start()
        osc.stop(ctx.currentTime + note.dur / 1000 + 0.05)
      }, offset)
      timers.push(noteTimer)
      offset += note.dur + 60 // small gap between notes
    }
    // Repeat after a pause (total cycle ~2.5s)
    timer = setTimeout(playSequence, offset + 1200)
    timers.push(timer)
  }

  const timers: ReturnType<typeof setTimeout>[] = []
  playSequence()

  return {
    stop() {
      stopped = true
      for (const t of timers) clearTimeout(t)
      try { ctx.close() } catch {}
    },
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface InboundCallInfo {
  caller_phone: string
  contact_name: string | null
}

/**
 * Plays a melodic ringtone when there are ringing inbound calls
 * and the rep is NOT already on a call.
 */
export function useInboundRingtone(
  ringingCalls: InboundCallInfo[],
  callState: string,
) {
  const ringtoneRef = useRef<RingtoneHandle | null>(null)

  useEffect(() => {
    const shouldRing = ringingCalls.length > 0 && callState === 'idle'

    if (shouldRing) {
      if (!ringtoneRef.current) {
        try {
          ringtoneRef.current = createRingtone()
        } catch { /* audio not available */ }
      }
    } else {
      ringtoneRef.current?.stop()
      ringtoneRef.current = null
    }

    return () => {
      ringtoneRef.current?.stop()
      ringtoneRef.current = null
    }
  }, [ringingCalls.length, callState])
}
