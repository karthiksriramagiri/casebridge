// Venu — timing/pacing metrics computed from the session transcript.
//
// Scope note: the spec calls for Praat-style acoustic features (F0 contour,
// jitter, shimmer). Those need a Python worker and are not available in this
// runtime, so v1 derives the trait signals that turn-level timing can support —
// response gaps, talk ratio, speaking rate, interruptions, monologue length.
// Pitch/voice-quality features can be added later behind the same interface
// without touching the scorer.

import type { SessionMetrics, Turn } from './types'
import { repBaseline, delivery } from './prosody'
import { TRAIT_THRESHOLDS } from './rubrics'

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function computeMetrics(turns: Turn[]): SessionMetrics {
  const ordered = [...turns].sort((a, b) => a.startMs - b.startMs)
  const repTurns = ordered.filter((t) => t.speaker === 'rep')
  const callerTurns = ordered.filter((t) => t.speaker === 'caller')

  const lastMs = ordered.length ? Math.max(...ordered.map((t) => t.endMs)) : 0
  const durationSec = Math.round(lastMs / 1000)

  const repMs = repTurns.reduce((n, t) => n + Math.max(0, t.endMs - t.startMs), 0)
  const callerMs = callerTurns.reduce((n, t) => n + Math.max(0, t.endMs - t.startMs), 0)
  const totalSpeechMs = repMs + callerMs

  const repWords = repTurns.reduce((n, t) => n + words(t.text), 0)
  const repWordsPerMinute = repMs > 0 ? Math.round(repWords / (repMs / 60000)) : 0

  const responseGapsMs: number[] = []
  const hesitations: SessionMetrics['hesitations'] = []
  let interruptions = 0

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]
    const cur = ordered[i]
    if (prev.speaker === 'caller' && cur.speaker === 'rep') {
      const gap = cur.startMs - prev.endMs
      if (gap < 0) {
        interruptions++
        continue
      }
      responseGapsMs.push(gap)
      if (gap >= TRAIT_THRESHOLDS.hesitationGapMs) {
        hesitations.push({
          afterCallerSaid: prev.text.slice(-160),
          gapMs: gap,
          atMs: prev.endMs,
        })
      }
    }
  }

  let longestRepMonologueSec = 0
  let run = 0
  for (const t of ordered) {
    if (t.speaker === 'rep') {
      run += Math.max(0, t.endMs - t.startMs)
      longestRepMonologueSec = Math.max(longestRepMonologueSec, Math.round(run / 1000))
    } else {
      run = 0
    }
  }

  // Delivery, measured against the rep's own baseline for this call.
  const repProsody = repTurns.map((t) => t.prosody).filter((p): p is NonNullable<typeof p> => !!p)
  const base = repBaseline(repProsody)
  let prosody: SessionMetrics['prosody'] = null
  if (base && repProsody.length >= 3) {
    prosody = {
      baseline: base,
      turns: ordered
        .filter((t) => t.speaker === 'rep' && t.prosody)
        .map((t) => ({
          atMs: t.startMs,
          said: t.text.slice(0, 90),
          ...delivery(t.prosody!, base),
        })),
    }
  }

  return {
    durationSec,
    repTalkRatio: totalSpeechMs > 0 ? Number((repMs / totalSpeechMs).toFixed(2)) : 0,
    repWordsPerMinute,
    callerTurns: callerTurns.length,
    repTurns: repTurns.length,
    responseGapsMs,
    medianResponseGapMs: median(responseGapsMs),
    longestResponseGapMs: responseGapsMs.length ? Math.max(...responseGapsMs) : 0,
    hesitations,
    interruptions,
    longestRepMonologueSec,
    prosody,
  }
}

export function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Plain-language summary of the metrics, handed to the LLM scorer as evidence. */
export function describeMetrics(m: SessionMetrics): string {
  const t = TRAIT_THRESHOLDS
  const lines = [
    `Call length: ${mmss(m.durationSec * 1000)} (${m.repTurns} rep turns, ${m.callerTurns} caller turns)`,
    `Rep share of talk time: ${(m.repTalkRatio * 100).toFixed(0)}% (healthy range ${Math.round(t.repTalkRatioRange[0] * 100)}-${Math.round(t.repTalkRatioRange[1] * 100)}%)`,
    `Median response gap after the caller stops: ${m.medianResponseGapMs}ms (crisp under ${t.crispGapMs}ms, hesitant over ${t.hesitationGapMs}ms)`,
    `Longest response gap: ${m.longestResponseGapMs}ms`,
    `Times the rep started speaking before the caller finished: ${m.interruptions}`,
    `Longest uninterrupted rep stretch: ${m.longestRepMonologueSec}s (monologue above ${t.monologueSec}s)`,
  ]
  if (m.prosody) {
    const b = m.prosody.baseline
    lines.push(
      `Voice measurements from the microphone. This rep's own baseline for this call: ` +
      `median pitch ${b.medianF0 ?? 'n/a'}Hz, typical pitch movement ${b.variability ?? 'n/a'} semitones, ` +
      `average level ${b.meanDb}dB. Every turn below is expressed RELATIVE to that baseline ` +
      `(pitch movement as a ratio of their norm, pitch and level as deltas). Absolute values ` +
      `say nothing about warmth and differ by voice, so only the departures mean anything — ` +
      `and only next to what was being said at the time.`
    )
    lines.push('Per-turn delivery:')
    for (const t of m.prosody.turns) {
      const parts = [
        t.variabilityRatio !== null ? `movement ${Math.round(t.variabilityRatio * 100)}% of norm` : 'movement n/a',
        t.f0Delta !== null ? `pitch ${t.f0Delta >= 0 ? '+' : ''}${t.f0Delta.toFixed(1)}st` : 'pitch n/a',
        `level ${t.dbDelta >= 0 ? '+' : ''}${t.dbDelta.toFixed(1)}dB`,
      ]
      lines.push(`  - ${mmss(t.atMs)} "${t.said}" — ${parts.join(', ')}`)
    }
  } else {
    lines.push('No voice measurements for this call (the browser could not analyse the mic).')
  }

  if (m.hesitations.length) {
    lines.push('Hesitations (long silence before the rep answered):')
    for (const h of m.hesitations) {
      lines.push(`  - ${mmss(h.atMs)} — ${h.gapMs}ms of dead air after the caller said: "${h.afterCallerSaid}"`)
    }
  } else {
    lines.push('No hesitations over the threshold.')
  }
  return lines.join('\n')
}
