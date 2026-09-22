import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { anthropic } from '../app/venu/_lib/anthropic'
import { getNuanceScenario } from '../app/venu/_lib/nuance-scenarios'

const story = getNuanceScenario('n9-3')!.story
const system = `You are role-playing a real person who was in an accident, on a live phone call
with an intake rep in training. Never break character.

THE TRUTH OF YOUR SITUATION:
${story}

HOW TO PLAY IT
- You only say what you are actually asked about.
- Never volunteer the facts that decide this case.

HOW TO SPEAK
- USUALLY ONE SENTENCE. Two at the most.
- Real spoken English: contractions, false starts, trailing off.
- You are sore, tired and worn down by it, not chipper.`

// A realistic mid-call history (15 turns in).
const msgs: any[] = []
const pairs: [string, string][] = [
  ['Hi, is this Renata? Marcus with the intake team.', "Yeah, this is her."],
  ['How are you holding up?', "Sore. It's been a rough week honestly."],
  ['When did the accident happen?', 'Nine days ago.'],
  ['Can you walk me through it?', 'We were changing lanes on the freeway and clipped a car.'],
  ['Who was cited?', 'Our side. Unsafe lane change.'],
  ['Did police come out?', 'Yeah, they took a report.'],
  ['What injuries are you dealing with?', 'Neck, lower back, and headaches.'],
]
for (const [rep, caller] of pairs) {
  msgs.push({ role: 'user', content: rep })
  msgs.push({ role: 'assistant', content: caller })
}
msgs.push({ role: 'user', content: 'And have you been treating since then?' })

async function run(label: string, params: any, rounds = 3) {
  const client = anthropic()
  const times: number[] = []
  let sample = '', cached = 0, input = 0
  for (let i = 0; i < rounds; i++) {
    const t = Date.now()
    const r: any = await client.messages.create({ messages: msgs, ...params })
    times.push(Date.now() - t)
    if (i === rounds - 1) {
      sample = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      cached = r.usage.cache_read_input_tokens ?? 0
      input = r.usage.input_tokens
    }
  }
  console.log(`  ${label}`)
  console.log(`    times: ${times.join('ms, ')}ms   cache_read=${cached} uncached_input=${input}`)
  console.log(`    "${sample}"`)
}

async function main() {
  await run('BEFORE — haiku, max_tokens 160, no caching', {
    model: 'claude-haiku-4-5', max_tokens: 160, system,
  })
  await run('AFTER  — haiku, max_tokens 110, cached prefix', {
    model: 'claude-haiku-4-5', max_tokens: 110,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    cache_control: { type: 'ephemeral' },
  })
}
main().catch(e => { console.error(e); process.exit(1) })
