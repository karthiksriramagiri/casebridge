import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { computeMetrics } from '../app/venu/_lib/metrics'
import { scoreSetterSession } from '../app/venu/_lib/scoring'
import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
import { NUANCE_LEADS } from '../app/venu/_lib/nuance-leads'
import type { Turn } from '../app/venu/_lib/types'

// Karthik's actual call, verbatim.
const script: [Turn['speaker'], string, number, number][] = [
  ['caller', "Hi, who's this?", 0, 2500],
  ['rep', 'Am I speaking with Bethany?', 3000, 5500],
  ['caller', "Yeah, that's me.", 6000, 7500],
  ['rep', 'Hey, Bethany. Nice to meet you. This is Carter on behalf of Accident Support Desk. I saw you had the submission for the car accident. How are you?', 8000, 15500],
  ['caller', "I'm... doing okay, I guess. Still pretty sore, but yeah. Thanks for calling.", 16000, 22000],
  ['rep', 'Yeah. Of course. Of course. I did want to just make sure. Did the accident happen in Oregon?', 23000, 29500],
  ['caller', 'Yeah, it was here in Oregon. Portland area.', 30000, 33500],
  ['rep', 'Yes. So we are based in the California region. So you might wanna go ahead and just check to make sure it is somebody in the Oregon area. Okay?', 34000, 44000],
  ['caller', 'Um, okay. So you’re saying I should call someone in Oregon instead, or...', 45000, 50000],
  ['rep', "That's correct. That's correct. Have a good day. Okay?", 51000, 53500],
  ['caller', 'Alright, I guess I can do that. Thanks.', 54000, 57000],
]
const turns: Turn[] = script.map(([speaker, text, startMs, endMs]) => ({ speaker, text, startMs, endMs }))

async function main() {
  // The scenario Venu was playing, forced out of state as it was on the call.
  const scenario = NUANCE_SCENARIOS.find(s => /Hit-and-Run.*UM|UM.*Hit-and-Run/i.test(s.title)) ?? NUANCE_SCENARIOS[0]
  const lead = NUANCE_LEADS[scenario.id]
  const before = lead.state
  lead.state = 'OR'

  const metrics = computeMetrics(turns)
  const card = await scoreSetterSession({ scenario, turns, metrics, endReason: 'ended_by_rep', mode: 'practice' })
  lead.state = before

  console.log(`  scenario: ${scenario.title}`)
  console.log(`\n  OVERALL ${card.overallScore} | criteria ${card.criteriaScore} | empathy ${card.empathy.score}`)
  console.log(`\n  STATE GATE: inFootprint=${(card as any).stateGate?.inFootprint} handledCorrectly=${(card as any).stateGate?.handledCorrectly} turnsBefore=${(card as any).stateGate?.turnsBeforeAsking}`)
  console.log(`    ${(card as any).stateGate?.note}`)
  console.log(`\n  checkpoint statuses: ${card.checkpoints.map(c => c.status).join(', ')}`)
  console.log(`\n  SUMMARY: ${card.coachingSummary}`)
  console.log('\n  NEXT TIME:')
  card.doDifferentlyNextTime.forEach((d, i) => console.log(`    ${i + 1}. ${d}`))
}
main().catch(e => { console.error(e); process.exit(1) })
