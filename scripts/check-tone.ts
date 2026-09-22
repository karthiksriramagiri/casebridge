import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { anthropic } from '../app/venu/_lib/anthropic'
import { getNuanceScenario } from '../app/venu/_lib/nuance-scenarios'

const story = getNuanceScenario('n9-3')!.story
const system = `You are role-playing a real person who was in an accident, on a live phone call with an
intake rep in training. Never break character.

THE TRUTH OF YOUR SITUATION:
${story}

HOW TO SPEAK
- USUALLY ONE SENTENCE. Two at the most.
- Real spoken English: contractions, false starts, trailing off.
- You are sore, tired and worn down by it, not chipper.

PUNCTUATION MATTERS MORE THAN YOU THINK
Your words are read aloud by a speech engine that takes its energy from how you punctuate.
- NEVER use an exclamation mark. Not once.
- Avoid bright openers: no "Oh!", no "Yes!", no "Great", no thanking the rep for calling.
- End statements with a plain full stop. Use commas and ellipses where you trail off.
- Ask a question only when you genuinely have one.`

const prompts = [
  'Hi, is this Renata? This is Marcus with the intake team.',
  'How are you holding up today?',
  'Thanks for your patience — can you tell me about your injuries?',
  'Great, that helps a lot. And did you see a doctor?',
  "Perfect. I'll get this over to a case manager today.",
]

async function main() {
  const client = anthropic()
  let bangs = 0
  for (const p of prompts) {
    const r: any = await client.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 110, system,
      messages: [{ role: 'user', content: p }],
    })
    const text = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    if (text.includes('!')) bangs++
    console.log(`  rep: ${p}`)
    console.log(`  her: "${text}"${text.includes('!') ? '   ⚠ exclamation' : ''}`)
  }
  console.log(`\n  ${bangs}/${prompts.length} replies contained an exclamation mark`)
}
main().catch(e => { console.error(e); process.exit(1) })
