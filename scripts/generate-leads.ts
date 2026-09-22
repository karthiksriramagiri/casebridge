/**
 * Generates the lead-form submission that sits in front of each Nuance Book
 * scenario — the web form the prospective client filled in before anyone called
 * them, which is what the PC actually has on screen when the call connects.
 *
 * Run once and commit the result:
 *   npx tsx --tsconfig tsconfig.json scripts/generate-leads.ts > /tmp/leads.json
 *
 * Deliberately offline: the fields never change for a given scenario, so paying
 * for them at call time would be latency and cost for nothing.
 */
import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/\\n/g, '').trim()
}
import { z } from 'zod/v4'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { anthropic } from '../app/venu/_lib/anthropic'
import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'

const LeadSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().describe('US format like (949) 701-6067, invented'),
  email: z.string().describe('invented, consistent with the name'),
  accidentWindow: z.enum([
    'Within The Past 30 Days', 'Within The Past 3 Months',
    'Within The Past 12 Months', 'More Than 12 Months Ago',
  ]),
  lawyerHandling: z.enum(['Yes', 'No']),
  state: z.string().describe('Two-letter state code'),
  injuryOption: z.enum([
    'Aches And Pains', 'Broken Bones', 'Head Injury',
    'Hospitalization Required', 'Surgery Required', 'Other',
  ]),
  atFault: z.enum(['Yes', 'No', 'Not Sure']),
})

const SYSTEM = `You fill in a lead-generation web form exactly as the prospective client
would have filled it in themselves, days before any rep called them.

Rules:
- The name is the person who SUBMITTED the form. If the scenario's caller is a parent
  filing for a child, or someone calling about a relative, use the submitter's name as the
  scenario implies — not necessarily the injured party's.
- These are coarse dropdowns, not an intake interview. Pick the bucket that best fits.
- Self-reported and imperfect. A client who is unsure about fault picks "Not Sure". A
  client describing soreness picks "Aches And Pains" even if the real injury is worse.
- NEVER encode the detail that decides the case. The form must not give away the answer;
  it only gives the rep a name, a rough timeframe, and a starting point.
- Invent a plausible US phone number and an email that matches the name. Never reuse
  real-looking addresses from the scenario text.`

async function main() {
  const client = anthropic()
  const out: Record<string, unknown> = {}
  const queue = [...NUANCE_SCENARIOS]
  let done = 0

  async function worker() {
    for (;;) {
      const s = queue.shift()
      if (!s) return
      try {
        const r = await client.messages.parse({
          model: 'claude-haiku-4-5',
          max_tokens: 2000,
          system: SYSTEM,
          output_config: { format: zodOutputFormat(LeadSchema as any) },
          messages: [{
            role: 'user',
            content: `Scenario: ${s.title}\nCategory: ${s.category}\n\n${s.story}\n\nFill in the form this person submitted.`,
          }],
        })
        out[s.id] = r.parsed_output
      } catch (e) {
        console.error(`  ${s.id} failed: ${(e as Error).message}`)
      }
      done++
      if (done % 20 === 0) console.error(`  ${done}/${NUANCE_SCENARIOS.length}`)
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker))
  console.error(`generated ${Object.keys(out).length}/${NUANCE_SCENARIOS.length}`)
  process.stdout.write(JSON.stringify(out, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
