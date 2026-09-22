import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { anthropic } from '../app/venu/_lib/anthropic'
import { getNuanceScenario } from '../app/venu/_lib/nuance-scenarios'
import { getLead } from '../app/venu/_lib/nuance-leads'
import { personaSystem } from '../app/venu/_lib/persona'

const scenario = getNuanceScenario('n9-3')!
const system = personaSystem(scenario.story, getLead(scenario.id))
const pair: [string, string][] = [
  ['Hi, is this Renata?', "Yeah, that's me."],
  ['How are you holding up?', 'Sore. Rough week.'],
  ['When did it happen?', 'Nine days ago.'],
  ['Walk me through it?', 'We were changing lanes and clipped a car.'],
  ['Who got cited?', 'Our side.'],
  ['Police come out?', 'Yeah, they took a report.'],
  ['What injuries?', 'Neck, lower back, headaches.'],
  ['Seen anyone since?', 'ER that night, chiro after.'],
  ['Any car damage?', 'Passenger side is scraped up.'],
  ['Who is your insurer?', 'State Farm, I think.'],
  ['Anyone else in the car?', 'Just us.'],
  ['Have you signed anything?', 'No, nothing.'],
]
function build(n: number) {
  const msgs: any[] = []
  for (const [r, c] of pair.slice(0, n)) { msgs.push({ role: 'user', content: r }); msgs.push({ role: 'assistant', content: c }) }
  msgs.push({ role: 'user', content: 'And have you been back to the chiropractor this week?' })
  return msgs
}
async function run(label: string, messages: any[]) {
  const client = anthropic()
  const times: number[] = []
  let inTok = 0, cached = 0
  for (let i = 0; i < 3; i++) {
    const t = Date.now()
    const r: any = await client.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 110,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    })
    times.push(Date.now() - t); inTok = r.usage.input_tokens; cached = r.usage.cache_read_input_tokens ?? 0
  }
  const avg = Math.round(times.reduce((a,b)=>a+b,0)/times.length)
  console.log(`  ${label.padEnd(34)} ${String(avg).padStart(4)}ms   input ${inTok} cached ${cached}`)
}
async function main() {
  await run('full history (12 exchanges)', build(12))
  await run('trimmed to last 16 messages', build(12).slice(-17))
}
main().catch(e => { console.error(e); process.exit(1) })
