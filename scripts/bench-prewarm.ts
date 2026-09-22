import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
const KEY = (process.env.DEEPGRAM_API_KEY ?? '').trim()
const TEXT = "I don't know. It's just been a lot, honestly. I can't sleep and my back hasn't stopped hurting."
const VOICE = 'aura-2-andromeda-en'

async function firstByte(res: Response, from: number) {
  const reader = res.body!.getReader()
  await reader.read()
  const t = Date.now() - from
  reader.cancel()
  return t
}

async function main() {
  // Cold: request starts when the browser asks.
  let t = Date.now()
  let res = await fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}`, {
    method: 'POST', headers: { Authorization: `Token ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: TEXT }),
  })
  console.log(`  cold  (browser waits for the whole request): ${await firstByte(res, t)}ms to first audio byte`)

  // Pre-warmed: started ~40ms earlier, while the browser was still receiving /say.
  const started = Date.now()
  const p = fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}`, {
    method: 'POST', headers: { Authorization: `Token ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: TEXT }),
  })
  p.catch(() => {})
  await new Promise((r) => setTimeout(r, 40))   // browser round trip
  t = Date.now()
  res = await p
  console.log(`  warm  (synthesis already running):          ${await firstByte(res, t)}ms to first audio byte`)
  console.log(`  (synthesis actually began ${t - started}ms before the browser asked)`)
}
main().catch(e => { console.error(e); process.exit(1) })
