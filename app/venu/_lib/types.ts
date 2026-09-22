// Venu — shared types.

import type { TurnProsody, RepBaseline } from './prosody'

export type Mode = 'practice' | 'test'
export type Track = 'setter' | 'closer'
export type Speaker = 'rep' | 'caller'

export interface Turn {
  speaker: Speaker
  text: string
  /** ms from session start */
  startMs: number
  endMs: number
  /** How the rep sounded on this turn — measured from the mic, rep turns only. */
  prosody?: TurnProsody | null
  /** Stored audio for this turn, for listening back. Rep turns only. */
  audioPath?: string | null
}

export type CheckpointStatus = 'surfaced' | 'incomplete' | 'missed'

export interface CheckpointResult {
  id: string
  label: string
  status: CheckpointStatus
  evidence: string
  note: string
}

export interface FlaggedMoment {
  timestamp: string
  issue: string
  evidence: string
}

export interface SetterScorecard {
  checkpoints: CheckpointResult[]
  nuance: {
    caught: boolean
    detail: string
    note: string
  }
  criteriaScore: number
  empathy: {
    score: number
    evidence: string[]
    bestMoment: string
    worstMoment: string
  }
  overallScore: number
  coachingSummary: string
  doDifferentlyNextTime: string[]
  flaggedMoments: FlaggedMoment[]
}

export interface SessionMetrics {
  durationSec: number
  repTalkRatio: number
  repWordsPerMinute: number
  callerTurns: number
  repTurns: number
  responseGapsMs: number[]
  medianResponseGapMs: number
  longestResponseGapMs: number
  hesitations: { afterCallerSaid: string; gapMs: number; atMs: number }[]
  interruptions: number
  longestRepMonologueSec: number
  /** Null when the browser could not measure audio. */
  prosody?: {
    baseline: RepBaseline
    /**
     * Every measured rep turn, relative to that baseline. Deliberately not
     * pre-filtered: deciding which delivery shift matters requires knowing what
     * was said, which is the model's job, not a threshold's.
     */
    turns: {
      atMs: number
      said: string
      f0Delta: number | null
      variabilityRatio: number | null
      dbDelta: number
    }[]
  } | null
}
