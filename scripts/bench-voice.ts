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
function measure(p: string) {
  const { pcm, sampleRate } = readWav(p)
  const BUF = 2048, hop = Math.round(sampleRate * 0.03)
  const frames: ProsodyFrame[] = []
  for (let i = 0; i + BUF < pcm.length; i += hop) {
    const s = pcm.slice(i, i + BUF)
    frames.push({ t: Math.round(i / sampleRate * 1000), f0: detectPitch(s, sampleRate), db: rmsDb(s) })
  }
  return summarise(frames)
}
for (const v of ['old', 'new']) {
  const f0: number[] = [], mv: number[] = []
  for (const i of ['']) {
    const p = `/tmp/tx-${v}.wav`
    if (!fs.existsSync(p)) continue
    const s = measure(p)
    if (s?.medianF0) f0.push(s.medianF0)
    if (s?.pitchVariability) mv.push(s.pitchVariability)
  }
  const avg = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-'
  console.log(`  ${v.padEnd(10)} avg pitch ${String(avg(f0)).padStart(6)}Hz   avg movement ${String(avg(mv)).padStart(5)}st   (n=${mv.length})`)
}
