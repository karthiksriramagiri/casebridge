import { computeMetrics, describeMetrics } from '../app/venu/_lib/metrics'
import type { Turn } from '../app/venu/_lib/types'
const P = (v: number, db: number) => ({ medianF0: 148, pitchVariability: v, pitchRange: v * 2.6, meanDb: db, dbRange: 12, voicedRatio: 0.55 })
const turns: Turn[] = [
  { speaker: 'rep', text: "I'm sorry to hear that. Are you doing okay?", startMs: 1000, endMs: 4000, prosody: P(3.4, -20) },
  { speaker: 'caller', text: "Honestly no. I've been crying most days.", startMs: 4400, endMs: 11000 },
  { speaker: 'rep', text: "Okay. And what's the date of the accident?", startMs: 11200, endMs: 14000, prosody: P(1.5, -25) },
  { speaker: 'caller', text: 'Nine days ago.', startMs: 14400, endMs: 16000 },
  { speaker: 'rep', text: 'And who was at fault?', startMs: 16200, endMs: 18000, prosody: P(1.4, -26) },
]
const out = describeMetrics(computeMetrics(turns))
console.log(out.split('\n').filter(l => /Voice|delivery|movement/.test(l)).join('\n'))
