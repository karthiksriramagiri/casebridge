import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { anthropic } from '../app/venu/_lib/anthropic'
async function main() {
  const t = Date.now()
  const r: any = await anthropic().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 110,
    system: [{ type: 'text', text: 'You are a tired accident victim on the phone. One sentence answers. Never break character.', cache_control: { type: 'ephemeral' } }],
    cache_control: { type: 'ephemeral' },
    messages: [{ role: 'user', content: 'Hi, how are you doing today?' }],
  } as any)
  console.log(`  ok in ${Date.now() - t}ms`)
  console.log(`  "${r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')}"`)
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
