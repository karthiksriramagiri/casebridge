import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { z } from 'zod/v4'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { anthropic } from '../app/venu/_lib/anthropic'
import { SetterScorecardSchema } from '../app/venu/_lib/scoring'
import { getNuanceScenario } from '../app/venu/_lib/nuance-scenarios'
import { computeMetrics, describeMetrics } from '../app/venu/_lib/metrics'
import type { Turn } from '../app/venu/_lib/types'

const script: [Turn['speaker'], string, number, number][] = [
  ['caller', 'Hello?', 0, 900],
  ['rep', "Hi, is this Renata? Marcus with the intake team about your accident.", 1200, 6000],
  ['caller', "Yeah. Sorry, it's been a rough week.", 6400, 10000],
  ['rep', "I'm sorry to hear that. Are you doing okay?", 10300, 13500],
  ['caller', "Honestly no. My neck is killing me and I've been crying most days.", 14000, 22000],
  ['rep', "Okay. And what's the date of the accident?", 24200, 27000],
  ['caller', "Nine days ago.", 27400, 29500],
  ['rep', "And who was at fault?", 29700, 31500],
  ['caller', "The police cited our side for an unsafe lane change.", 32000, 37000],
  ['rep', "Got it. Any injuries treated yet?", 37200, 39800],
  ['caller', "ER that night, chiropractor five days later.", 40200, 45000],
  ['rep', "Great, that's what I need. A case manager will call you today.", 45200, 51000],
]
const turns: Turn[] = script.map(([speaker, text, startMs, endMs]) => ({ speaker, text, startMs, endMs }))
const scenario = getNuanceScenario('n9-3')!
const metrics = computeMetrics(turns)

async function run(effort: string) {
  const client = anthropic()
  const t = Date.now()
  const r: any = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 16000,
    output_config: { effort, format: zodOutputFormat(SetterScorecardSchema as any) },
    system: 'Score this setter call. Return the full structured scorecard.',
    messages: [{ role: 'user', content:
      `SCENARIO: ${scenario.title}\n${scenario.story}\n\nDECIDING DETAIL: ${scenario.nuance}\n\nMETRICS:\n${describeMetrics(metrics)}\n\nTRANSCRIPT:\n` +
      turns.map(t2 => `${t2.speaker.toUpperCase()}: ${t2.text}`).join('\n') }],
  })
  const ms = Date.now() - t
  const c = r.parsed_output
  console.log(`  effort=${effort.padEnd(7)} ${String(ms).padStart(6)}ms   out ${r.usage.output_tokens} (thinking ${r.usage.output_tokens_details?.thinking_tokens ?? 0})`)
  console.log(`      overall ${c.overallScore} | criteria ${c.criteriaScore} | empathy ${c.empathy.score} | nuance ${c.nuance.caught}`)
  console.log(`      "${c.coachingSummary.slice(0, 120)}..."`)
}
async function main() { for (const e of ['high', 'medium', 'low']) await run(e) }
main().catch(e => { console.error(e); process.exit(1) })
