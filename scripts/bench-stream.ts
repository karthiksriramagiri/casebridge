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
const system = personaSystem(sc.story, getLead(sc.id))
const messages: any[] = [
  { role: 'user', content: 'Hi, is this Renata? Marcus with the intake team.' },
  { role: 'assistant', content: "Yeah, that's me." },
  { role: 'user', content: 'How are you holding up since the accident?' },
]

async function main() {
  const client = anthropic()
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    let firstToken = 0, firstClause = 0, clause = '', full = ''
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5', max_tokens: 110,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    })
    stream.on('text', (delta) => {
      if (!firstToken) firstToken = Date.now() - t0
      full += delta
      if (!firstClause) {
        clause += delta
        // Enough to speak: a clause boundary, or a decent run of words.
        if (/[,.!?;—]/.test(clause) && clause.trim().split(/\s+/).length >= 4) {
          firstClause = Date.now() - t0
        }
      }
    })
    await stream.finalMessage()
    const total = Date.now() - t0
    console.log(`  run ${i + 1}: first token ${firstToken}ms | speakable clause ${firstClause || total}ms | full reply ${total}ms`)
    if (i === 0) console.log(`         "${full}"`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
