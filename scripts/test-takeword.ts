import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { computeMetrics } from '../app/venu/_lib/metrics'
import { scoreSetterSession } from '../app/venu/_lib/scoring'
import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
import type { Turn } from '../app/venu/_lib/types'

const script: [Turn['speaker'], string, number, number][] = [
  ['caller', 'Hello?', 0, 900],
  ['rep', 'Hi, is this Yusuf? This is Carter with Accident Support Desk about your accident.', 1200, 7000],
  ['caller', "Yeah, that's me.", 7400, 9000],
  ['rep', "Good to meet you. How are you holding up?", 9400, 12000],
  ['caller', "Honestly, still pretty sore. Neck mostly.", 12400, 16000],
  ['rep', "I'm sorry, that's rough. Is that still bothering you day to day?", 16400, 20000],
  ['caller', "Yeah, especially in the mornings.", 20400, 23000],
  ['rep', "And this happened in California, right? What day was it?", 23400, 27000],
  ['caller', "Yeah, Fresno. It was twelve days ago.", 27400, 31000],
  ['rep', "Walk me through what happened.", 31400, 33500],
  ['caller', "I was going straight through a green light and he turned left right across me.", 34000, 40000],
  ['rep', "So he turned into you. Did police come out?", 40400, 44000],
  ['caller', "Yeah, they took a report. He got cited.", 44400, 48000],
  ['rep', "Good. And do you know who he's insured with?", 48400, 51500],
  ['caller', "He handed me his card — Mercury Insurance.", 52000, 56000],
  ['rep', "Perfect, that helps. Have you been seen by anyone since?", 56400, 60000],
  ['caller', "Urgent care two days after, and I've got a chiropractor Thursday.", 60400, 65000],
  ['rep', "And what about your car?", 65400, 67500],
  ['caller', "Front end's pretty crushed. It's at a shop in Fresno.", 68000, 72000],
  ['rep', "That's everything I need. I'm going to get you over to a case manager today, and they'll walk you through next steps.", 72400, 79000],
]
const turns: Turn[] = script.map(([speaker, text, startMs, endMs]) => ({ speaker, text, startMs, endMs }))

async function main() {
  const scenario = NUANCE_SCENARIOS.find(s => /Unprotected Left/i.test(s.title))!
  const metrics = computeMetrics(turns)
  const card = await scoreSetterSession({ scenario, turns, metrics, endReason: 'completed', mode: 'practice' })
  console.log(`  scenario: ${scenario.title}`)
  console.log(`  OVERALL ${card.overallScore} | criteria ${card.criteriaScore} | empathy ${card.empathy.score}`)
  const ins = card.checkpoints.find(c => c.id === 'police_insurance')!
  console.log(`\n  INSURANCE CHECKPOINT: ${ins.status}`)
  console.log(`    ${ins.note}`)
  console.log('\n  NEXT TIME:')
  card.doDifferentlyNextTime.forEach((d, i) => console.log(`    ${i + 1}. ${d}`))
  const bad = /verify|in force|actually reached out|lapsed|really have|double.?check with/i
  const flagged = card.doDifferentlyNextTime.filter(d => bad.test(d))
  console.log(`\n  verification-style coaching items: ${flagged.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
