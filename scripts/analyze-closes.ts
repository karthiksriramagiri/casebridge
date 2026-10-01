import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { z } from 'zod/v4'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { anthropic } from '../app/venu/_lib/anthropic'

const Schema = z.object({
  phases: z.array(z.object({
    order: z.number(),
    name: z.string(),
    purpose: z.string(),
    whatGoodSoundsLike: z.array(z.string()).describe('Actual lines reps used, quoted from the calls'),
    commonFailure: z.string(),
  })),
  questions: z.array(z.object({
    question: z.string().describe("The PC's question in their own words"),
    howOften: z.enum(['very common', 'common', 'occasional']),
    whatTheyAreReallyAsking: z.string(),
    goodAnswer: z.string().describe('An answer a rep actually gave that worked'),
    badAnswer: z.string().describe('How reps fumbled it, if they did'),
  })),
  signatureMechanics: z.object({
    howItIsSent: z.string(),
    whatRepsSayWhileSending: z.array(z.string()),
    holdingThemOnTheLine: z.string(),
    commonStallPoints: z.array(z.string()),
  }),
  hardRules: z.array(z.string()),
  evidenceGaps: z.array(z.string()).describe('What these transcripts do NOT show, that a closer standard would need'),
})

async function main() {
  const calls = JSON.parse(fs.readFileSync('/tmp/close_corpus.json', 'utf8')) as any[]
  const corpus = calls.map((c, i) =>
    `=== CALL ${i + 1} (${(c.completed_at || '').slice(0, 10)}) ===\n${c.full_text}`).join('\n\n')
  console.error(`  ${calls.length} calls, ${corpus.split(/\s+/).length.toLocaleString()} words`)

  // Streamed, with a generous cap: the first attempt truncated mid-JSON at
  // 16k and the parse blew up on an unterminated string.
  const stream = anthropic().messages.stream({
    model: 'claude-opus-5',
    max_tokens: 40000,
    output_config: { effort: 'high', format: zodOutputFormat(Schema as any) },
    system: `You are studying real recorded calls that ended with a signed retainer, from a
personal injury intake operation, in order to write the training standard for CLOSERS.

A closer takes a prospective client (PC) already qualified by a setter, explains the firm and
the process, answers their questions, and gets the retainer signed on that call.

Every one of these calls resulted in a signature — treat them as evidence of what works.

Rules:
- Ground everything in what reps actually said. Quote real lines.
- Do not invent best practice, import generic sales technique, or describe what ought to happen.
- Where reps did something badly and still closed, say so — do not launder it into advice.
- Transcription is imperfect: speaker labels may be missing or wrong and words are garbled.
  Infer speakers from context and ignore obvious noise.
- Be honest in evidenceGaps about what this sample cannot tell us.`,
    messages: [{ role: 'user', content: `${corpus}\n\nProduce the closing standard from these calls.` }],
  })

  const r = await stream.finalMessage()
  const raw = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  if (r.stop_reason === 'max_tokens') {
    console.error('  WARNING: hit the token cap — output may be incomplete')
  }
  const o: any = Schema.parse(JSON.parse(raw))
  fs.writeFileSync('/tmp/close-analysis.json', JSON.stringify(o, null, 2))
  console.log(`\nPHASES OF THE CLOSE`)
  for (const p of o.phases) {
    console.log(`\n  ${p.order}. ${p.name.toUpperCase()} — ${p.purpose}`)
    for (const l of p.whatGoodSoundsLike.slice(0, 2)) console.log(`      "${l}"`)
    console.log(`      fails when: ${p.commonFailure}`)
  }
  console.log(`\n\nQUESTIONS PCs ASK`)
  for (const q of o.questions) {
    console.log(`\n  [${q.howOften}] "${q.question}"`)
    console.log(`      really asking: ${q.whatTheyAreReallyAsking}`)
    console.log(`      good: ${q.goodAnswer}`)
  }
  console.log(`\n  usage in ${r.usage.input_tokens} / out ${r.usage.output_tokens}`)
}
main().catch(e => { console.error(e); process.exit(1) })
