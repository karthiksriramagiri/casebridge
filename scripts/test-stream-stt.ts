import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { push, finish } from '../app/venu/_lib/stt-stream'

async function main() {
  const audio = fs.readFileSync('/tmp/utter.mp3')
  const SESSION = 'test-session'

  // Mimic the client: 250ms slices arriving while the rep talks.
  const slices = 12
  const per = Math.ceil(audio.length / slices)
  const spokeFor = Date.now()
  for (let i = 0; i < slices; i++) {
    await push(SESSION, audio.subarray(i * per, (i + 1) * per).buffer as ArrayBuffer)
    await new Promise((r) => setTimeout(r, 250))
  }
  console.log(`  streamed ${slices} slices over ${Date.now() - spokeFor}ms of "speech"`)

  // Let the last slice land before asking for the flush.
  const settle = Number(process.env.SETTLE_MS ?? 0)
  if (settle) await new Promise((r) => setTimeout(r, settle))

  // The rep stops: this is the only part on the critical path.
  const t = Date.now()
  const text = await finish(SESSION)
  console.log(`  flush after speech ended: ${Date.now() - t}ms`)
  console.log(`  transcript: "${text}"`)

  // Batch, for comparison.
  const t2 = Date.now()
  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true', {
    method: 'POST',
    headers: { Authorization: `Token ${(process.env.DEEPGRAM_API_KEY ?? '').trim()}`, 'Content-Type': 'audio/mpeg' },
    body: audio,
  })
  const d: any = await res.json()
  console.log(`  batch (what we do today): ${Date.now() - t2}ms`)
  console.log(`  transcript: "${d.results.channels[0].alternatives[0].transcript}"`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
