import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { anthropic } from '../app/venu/_lib/anthropic'
import { getNuanceScenario } from '../app/venu/_lib/nuance-scenarios'
import { getLead } from '../app/venu/_lib/nuance-leads'
import { personaSystem } from '../app/venu/_lib/persona'

const sc = getNuanceScenario('n9-3')!
const full = personaSystem(sc.story, getLead(sc.id))
const messages: any[] = [
  { role: 'user', content: 'Hi, is this Renata? Marcus with the intake team.' },
  { role: 'assistant', content: "Yeah, that's me." },
  { role: 'user', content: 'How are you holding up since the accident?' },
]

async function timeIt(label: string, system: string) {
  const client = anthropic()
  const count = await client.messages.countTokens({ model: 'claude-haiku-4-5', system, messages })
  const times: number[] = []
  for (let i = 0; i < 3; i++) {
    const t = Date.now()
    await client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 90, system, messages })
    times.push(Date.now() - t)
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  console.log(`  ${label.padEnd(18)} ${String(count.input_tokens).padStart(5)} input tokens → ${String(avg).padStart(5)}ms avg`)
}

async function main() {
  await timeIt('current prompt', full)
  await timeIt('half the prompt', full.slice(0, Math.floor(full.length / 2)))
  await timeIt('tiny prompt', 'You are a tired accident victim on the phone. One short sentence. Never break character. No asterisks.')
}
main().catch(e => { console.error(e); process.exit(1) })
