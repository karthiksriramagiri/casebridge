import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { z } from 'zod/v4'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { anthropic } from '../app/venu/_lib/anthropic'
import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
import { NUANCE_LEADS } from '../app/venu/_lib/nuance-leads'

const S = z.object({ voiceGender: z.enum(['female', 'male']) })

async function main() {
  const client = anthropic()
  const out: Record<string, string> = {}
  const queue = [...NUANCE_SCENARIOS]
  async function worker() {
    for (;;) {
      const s = queue.shift(); if (!s) return
      const lead = NUANCE_LEADS[s.id]
      try {
        const r = await client.messages.parse({
          model: 'claude-haiku-4-5', max_tokens: 1000,
          system: 'Identify the gender of the PERSON WHO WILL BE ON THE PHONE — the caller in the scenario, which is the person who submitted the form. Use the pronouns and relationships in the text. If genuinely ambiguous, judge from the first name.',
          output_config: { format: zodOutputFormat(S as any) },
          messages: [{ role: 'user', content: `Form name: ${lead?.firstName} ${lead?.lastName}\n\n${s.story}` }],
        })
        out[s.id] = (r.parsed_output as any).voiceGender
      } catch { out[s.id] = 'female' }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  const f = Object.values(out).filter(v => v === 'female').length
  console.error(`assigned ${Object.keys(out).length}: ${f} female, ${Object.keys(out).length - f} male`)
  process.stdout.write(JSON.stringify(out))
}
main().catch(e => { console.error(e); process.exit(1) })
