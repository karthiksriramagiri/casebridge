// Venu — prosody measurement from the live mic.
//
// The transcript tells you what the rep said and the word timestamps tell you
// how fast they said it. Neither tells you how they sounded, which is half of
// empathy: "I'm so sorry that happened" read in a flat monotone is a different
// call from the same words meant.
//
// This runs in the browser off the existing mic stream — no recording upload,
// no Python, no second vendor. Every ~30ms it takes one frame of pitch (F0 by
// autocorrelation) and loudness (RMS), and each rep turn is summarised from the
// frames inside its time window.

export interface ProsodyFrame {
  /** ms from session start */
  t: number
  /** fundamental frequency in Hz, or null when the frame is unvoiced */
  f0: number | null
  /** loudness in dBFS (negative; -100 is silence) */
  db: number
}

export interface TurnProsody {
  medianF0: number | null
  /** Pitch spread in semitones — the monotone/expressive axis. */
  pitchVariability: number | null
  pitchRange: number | null
  meanDb: number
  /** Loudness spread in dB — flat delivery moves little. */
  dbRange: number
  /** Share of frames that carried a pitch, i.e. how much was actual speech. */
  voicedRatio: number
}

const SAMPLE_INTERVAL_MS = 30
const BUFFER = 2048
const MIN_F0 = 70    // below a low male voice
const MAX_F0 = 400   // above a high female voice
const SILENCE_DB = -55

/**
 * Pitch by normalised autocorrelation. Returns null when the frame has no
 * clear periodicity — silence, breath, or a consonant — so unvoiced frames
 * never drag the pitch statistics around.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length

  let rms = 0
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / n)
  if (rms < 0.006) return null

  // Trim leading/trailing near-silence so the correlation window is speech.
  const threshold = 0.2
  let start = 0
  let end = n - 1
  while (start < n / 2 && Math.abs(buf[start]) < threshold) start++
  while (end > n / 2 && Math.abs(buf[end]) < threshold) end--
  const slice = buf.slice(start, end)
  const m = slice.length
  if (m < 256) return null

  const minLag = Math.floor(sampleRate / MAX_F0)
  const maxLag = Math.min(Math.floor(sampleRate / MIN_F0), m - 1)
  if (maxLag <= minLag) return null

  let bestLag = -1
  let bestCorr = 0
  let energy0 = 0
  for (let i = 0; i < m; i++) energy0 += slice[i] * slice[i]
  if (energy0 === 0) return null

  // Scan from above MAX_F0 so the correlation has room to fall before the
  // first real peak, but only accept peaks inside the speech range. Without
  // the dip requirement a tone well below MIN_F0 still correlates strongly at
  // short lags — a 40Hz rumble gets reported as 400Hz.
  const scanFrom = Math.floor(sampleRate / (MAX_F0 * 2))
  let dipped = false

  for (let lag = scanFrom; lag <= maxLag; lag++) {
    let corr = 0
    let energyLag = 0
    const limit = m - lag
    for (let i = 0; i < limit; i++) {
      corr += slice[i] * slice[i + lag]
      energyLag += slice[i + lag] * slice[i + lag]
    }
    // Normalise so long lags aren't penalised by having fewer terms.
    const norm = Math.sqrt(energy0 * energyLag) || 1
    const score = corr / norm

    if (!dipped) {
      if (score < 0.4) dipped = true
      continue
    }
    if (lag >= minLag && score > bestCorr) {
      bestCorr = score
      bestLag = lag
    }
  }

  // Never dipped: the period is longer than anything we scanned, so the true
  // pitch is below the speech range. Unvoiced rather than an octave guess.
  if (!dipped) return null

  // Periodicity too weak to trust — treat as unvoiced rather than guess.
  if (bestLag < 0 || bestCorr < 0.5) return null

  // Parabolic interpolation around the peak for sub-sample accuracy.
  const refine = (lag: number): number => {
    if (lag <= minLag || lag >= maxLag) return lag
    const corrAt = (l: number) => {
      let c = 0
      for (let i = 0; i < m - l; i++) c += slice[i] * slice[i + l]
      return c
    }
    const y0 = corrAt(lag - 1)
    const y1 = corrAt(lag)
    const y2 = corrAt(lag + 1)
    const denom = 2 * (2 * y1 - y2 - y0)
    if (denom === 0) return lag
    return lag + (y2 - y0) / denom
  }

  const f0 = sampleRate / refine(bestLag)
  return f0 >= MIN_F0 && f0 <= MAX_F0 ? f0 : null
}

export function rmsDb(buf: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  const rms = Math.sqrt(sum / buf.length)
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Semitones between two frequencies — perceptually even, unlike raw Hz. */
function semitones(hz: number, ref: number): number {
  return 12 * Math.log2(hz / ref)
}

export function summarise(frames: ProsodyFrame[]): TurnProsody | null {
  if (frames.length === 0) return null

  const audible = frames.filter((f) => f.db > SILENCE_DB)
  const voiced = audible.filter((f) => f.f0 !== null).map((f) => f.f0 as number)
  const dbs = audible.map((f) => f.db)

  if (audible.length === 0) return null

  let medianF0: number | null = null
  let pitchVariability: number | null = null
  let pitchRange: number | null = null

  // Under ~8 voiced frames (240ms of speech) the spread is noise, not delivery.
  if (voiced.length >= 8) {
    medianF0 = median(voiced)
    const st = voiced.map((f) => semitones(f, medianF0 as number))
    const mean = st.reduce((a, b) => a + b, 0) / st.length
    pitchVariability = Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length)
    // 10th-90th percentile keeps one cracked frame from inventing an octave.
    const sorted = [...st].sort((a, b) => a - b)
    const lo = sorted[Math.floor(sorted.length * 0.1)]
    const hi = sorted[Math.floor(sorted.length * 0.9)]
    pitchRange = hi - lo
  }

  const meanDb = dbs.reduce((a, b) => a + b, 0) / dbs.length
  const sortedDb = [...dbs].sort((a, b) => a - b)
  const dbRange =
    sortedDb[Math.floor(sortedDb.length * 0.9)] - sortedDb[Math.floor(sortedDb.length * 0.1)]

  return {
    medianF0: medianF0 === null ? null : Math.round(medianF0),
    pitchVariability: pitchVariability === null ? null : Number(pitchVariability.toFixed(2)),
    pitchRange: pitchRange === null ? null : Number(pitchRange.toFixed(2)),
    meanDb: Number(meanDb.toFixed(1)),
    dbRange: Number(dbRange.toFixed(1)),
    voicedRatio: Number((voiced.length / audible.length).toFixed(2)),
  }
}

/**
 * Samples the mic for the length of a call. Frames are timestamped against the
 * same clock the transcript uses, so any turn window can be summarised later.
 */
export class ProsodyMeter {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private buf: Float32Array = new Float32Array(BUFFER)
  frames: ProsodyFrame[] = []

  /** @param now - returns ms from session start, shared with the transcript */
  start(stream: MediaStream, now: () => number): boolean {
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ?? (window as any).webkitAudioContext
      if (!Ctx) return false

      this.ctx = new Ctx()
      const source = this.ctx.createMediaStreamSource(stream)
      const analyser = this.ctx.createAnalyser()
      analyser.fftSize = BUFFER
      source.connect(analyser)
      // Deliberately not connected to the destination — this only listens.
      this.analyser = analyser

      this.timer = setInterval(() => {
        if (!this.analyser || !this.ctx) return
        this.analyser.getFloatTimeDomainData(this.buf as any)
        this.frames.push({
          t: now(),
          f0: detectPitch(this.buf, this.ctx.sampleRate),
          db: rmsDb(this.buf),
        })
      }, SAMPLE_INTERVAL_MS)

      return true
    } catch {
      // Prosody is an enhancement — a browser that won't play along should
      // never take the call down with it.
      return false
    }
  }

  /** Loudness of the most recent frame, for voice-activity detection. */
  currentDb(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].db : -100
  }

  /**
   * Quietest level seen recently — the room's noise floor. Speech detection is
   * relative to this, because mic gain varies wildly between machines.
   */
  noiseFloor(): number {
    const recent = this.frames.slice(-200)
    if (recent.length < 20) return -60
    const sorted = recent.map((f) => f.db).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.15)]
  }

  /** Summary for one turn window, by the transcript's own clock. */
  between(startMs: number, endMs: number): TurnProsody | null {
    return summarise(this.frames.filter((f) => f.t >= startMs && f.t <= endMs))
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    try { this.ctx?.close() } catch {}
    this.ctx = null
    this.analyser = null
  }
}

// ── Baseline-relative delivery ────────────────────────────────────────────
//
// Absolute prosody numbers do not travel. Validated against synthesised speech,
// a clipped "Okay. Got it. And the date of the accident." scored HIGHER pitch
// variability (4.9 st) than a warm "I'm so sorry, that sounds really scary"
// (3.6 st), because terse sentences are full of final falls. Voices also differ
// enormously from person to person.
//
// What does carry meaning is a rep measured against their own call: where did
// THEY flatten, speed up, or drop their voice, and what had the caller just
// said? Everything below is expressed relative to that baseline.

export interface RepBaseline {
  medianF0: number | null
  variability: number | null
  meanDb: number
}

export interface TurnDelivery {
  /** Semitones above/below this rep's own median pitch for the call. */
  f0Delta: number | null
  /** Pitch movement as a share of their own norm: 1.0 is typical, 0.5 is flat for them. */
  variabilityRatio: number | null
  /** dB above/below their own average loudness. */
  dbDelta: number
}

export function repBaseline(turns: TurnProsody[]): RepBaseline | null {
  const usable = turns.filter(Boolean)
  if (usable.length === 0) return null
  const f0s = usable.map((t) => t.medianF0).filter((v): v is number => v !== null)
  const vars = usable.map((t) => t.pitchVariability).filter((v): v is number => v !== null)
  const dbs = usable.map((t) => t.meanDb)
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 0
  }
  return {
    medianF0: f0s.length ? med(f0s) : null,
    variability: vars.length ? med(vars) : null,
    meanDb: dbs.length ? med(dbs) : 0,
  }
}

export function delivery(turn: TurnProsody, base: RepBaseline): TurnDelivery {
  return {
    f0Delta:
      turn.medianF0 !== null && base.medianF0
        ? Number((12 * Math.log2(turn.medianF0 / base.medianF0)).toFixed(2))
        : null,
    variabilityRatio:
      turn.pitchVariability !== null && base.variability
        ? Number((turn.pitchVariability / base.variability).toFixed(2))
        : null,
    dbDelta: Number((turn.meanDb - base.meanDb).toFixed(1)),
  }
}
