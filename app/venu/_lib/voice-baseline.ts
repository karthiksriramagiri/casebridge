import type { TurnProsody } from './prosody'

/**
 * A rep's own voice, measured once, so later calls can be read against it.
 *
 * Two takes rather than one. A single neutral sample tells you where someone
 * sits, but not how far they move when they mean it — and the distance between
 * those two is the only thing that carries meaning. Ranges differ enormously
 * between people; one rep's warm is another's flat.
 *
 * OBSERVE ONLY for now. Nothing here feeds the empathy score. An earlier
 * assumption in this project — that more pitch movement meant more warmth —
 * turned out to be backwards under measurement, so these features get collected
 * and checked against real calls before they are allowed to grade anyone.
 */

export interface BaselineTake {
  medianF0: number | null
  pitchVariability: number | null
  tilt: number | null
  pace: number | null
  meanDb: number
}

export interface VoiceBaseline {
  neutral: BaselineTake
  warm?: BaselineTake | null
  capturedAt: string
}

export const BASELINE_SCRIPTS = {
  neutral: {
    label: 'Read this plainly',
    hint: 'Flat and factual, the way you would read a form field out loud.',
    text: 'The accident was on the fourteenth of March, on Bellaire at Chimney Rock. A police report was taken and the other driver was cited.',
  },
  warm: {
    label: 'Now read this like you mean it',
    hint: 'To someone who has just told you they have been crying most days.',
    text: 'I am really sorry. That sounds like it has been an awful few weeks, and I am glad you called. Take your time — there is no rush at all.',
  },
}

export function takeFrom(p: TurnProsody | null): BaselineTake | null {
  if (!p) return null
  return {
    medianF0: p.medianF0,
    pitchVariability: p.pitchVariability,
    tilt: p.tilt ?? null,
    pace: p.pace ?? null,
    meanDb: p.meanDb,
  }
}

/** How far the warm take sits from the neutral one, per feature. */
export function contrast(b: VoiceBaseline) {
  if (!b.warm) return null
  const d = (a: number | null, c: number | null) =>
    a === null || c === null ? null : Number((a - c).toFixed(2))
  return {
    pitch: d(b.warm.medianF0, b.neutral.medianF0),
    movement: d(b.warm.pitchVariability, b.neutral.pitchVariability),
    tilt: d(b.warm.tilt, b.neutral.tilt),
    pace: d(b.warm.pace, b.neutral.pace),
    level: d(b.warm.meanDb, b.neutral.meanDb),
  }
}
