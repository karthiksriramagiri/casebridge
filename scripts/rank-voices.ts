import fs from 'node:fs'
import { detectPitch, rmsDb, summarise, type ProsodyFrame } from '../app/venu/_lib/prosody'
function readWav(path: string) {
  const b = fs.readFileSync(path)
  let off = 12, sampleRate = 48000, dataOff = 0, dataLen = 0
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4); const size = b.readUInt32LE(off + 4)
    if (id === 'fmt ') sampleRate = b.readUInt32LE(off + 12)
    if (id === 'data') { dataOff = off + 8; dataLen = size; break }
    off += 8 + size + (size % 2)
  }
  const n = Math.floor(dataLen / 2); const pcm = new Float32Array(n)
  for (let i = 0; i < n; i++) pcm[i] = b.readInt16LE(dataOff + i * 2) / 32768
  return { pcm, sampleRate }
}
const rows: { v: string; g: string; f0: number; mv: number; dur: number }[] = []
for (const line of fs.readFileSync('/tmp/voices.lines', 'utf8').split('\n')) {
  if (!line.trim()) continue
  const [v, g] = line.split(':')
  const p = `/tmp/sv-${v}.wav`
  if (!fs.existsSync(p)) continue
  const { pcm, sampleRate } = readWav(p)
  const BUF = 2048, hop = Math.round(sampleRate * 0.03)
  const frames: ProsodyFrame[] = []
  for (let i = 0; i + BUF < pcm.length; i += hop) {
    const s = pcm.slice(i, i + BUF)
    frames.push({ t: 0, f0: detectPitch(s, sampleRate), db: rmsDb(s) })
  }
  const s = summarise(frames)
  if (!s?.medianF0 || !s.pitchVariability) continue
  rows.push({ v, g, f0: s.medianF0, mv: s.pitchVariability, dur: pcm.length / sampleRate })
}
// Downcast = low pitch for its register + little pitch movement + unhurried.
for (const g of ['f', 'm']) {
  const set = rows.filter(r => r.g === g)
  const meanF0 = set.reduce((a, r) => a + r.f0, 0) / set.length
  const scored = set.map(r => ({ ...r, score: (r.f0 - meanF0) / meanF0 * 2 + r.mv / 4 }))
  scored.sort((a, b) => a.score - b.score)
  console.log(`\n  ${g === 'f' ? 'FEMALE' : 'MALE'} — most downcast first (register mean ${meanF0.toFixed(0)}Hz)`)
  for (const r of scored.slice(0, 7)) {
    console.log(`    ${r.v.padEnd(11)} ${String(r.f0).padStart(4)}Hz  move ${r.mv.toFixed(2)}st  ${r.dur.toFixed(1)}s`)
  }
  console.log(`    ...`)
  for (const r of scored.slice(-2)) {
    console.log(`    ${r.v.padEnd(11)} ${String(r.f0).padStart(4)}Hz  move ${r.mv.toFixed(2)}st  ${r.dur.toFixed(1)}s  ← brightest`)
  }
}
