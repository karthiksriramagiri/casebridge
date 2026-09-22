import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
const KEY = (process.env.DEEPGRAM_API_KEY ?? '').trim()
const TEXT = "I'm doing okay, I guess. Still pretty sore from the accident, honestly."
const VOICE = 'aura-2-andromeda-en'

async function rest() {
  const t = Date.now()
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}`, {
    method: 'POST',
    headers: { Authorization: `Token ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: TEXT }),
  })
  const reader = res.body!.getReader()
  await reader.read()
  const ms = Date.now() - t
  reader.cancel()
  return ms
}

async function ws() {
  return new Promise<number>((resolve) => {
    const t = Date.now()
    const params = new URLSearchParams({ model: VOICE, encoding: 'mp3' })
    const sock = new WebSocket(`wss://api.deepgram.com/v1/speak?${params}`, ['token', KEY])
    let done = false
    sock.onopen = () => {
      sock.send(JSON.stringify({ type: 'Speak', text: TEXT }))
      sock.send(JSON.stringify({ type: 'Flush' }))
    }
    sock.onmessage = (e) => {
      if (done) return
      // Binary frame = audio.
      if (typeof e.data !== 'string') { done = true; resolve(Date.now() - t); try { sock.close() } catch {} }
    }
    sock.onerror = () => { if (!done) { done = true; resolve(-1) } }
    setTimeout(() => { if (!done) { done = true; resolve(-2) } }, 8000)
  })
}

async function main() {
  const r: number[] = [], w: number[] = []
  for (let i = 0; i < 3; i++) r.push(await rest())
  for (let i = 0; i < 3; i++) w.push(await ws())
  const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length)
  console.log(`  REST /v1/speak      first audio byte: ${r.join('ms, ')}ms  → avg ${avg(r)}ms`)
  console.log(`  WS   /v1/speak      first audio byte: ${w.join('ms, ')}ms  → avg ${avg(w)}ms`)
  if (w.some(x => x < 0)) console.log('  (negative = socket error / timeout — streaming speak may not be enabled)')
}
main().catch(e => { console.error(e); process.exit(1) })
