import fs from 'node:fs'
import { detectPitch, rmsDb, type ProsodyFrame } from '../app/venu/_lib/prosody'

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

/** Spectral tilt: how much energy sits low vs high. Soft, breathy, warm voices
 *  lose high-frequency energy; hard, clipped delivery keeps it. */
function tilt(buf: Float32Array, sampleRate: number): number {
  const N = 1024
  let lo = 0, hi = 0
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sampleRate) / N
    let re = 0, im = 0
    for (let n = 0; n < N; n++) {
      const a = (-2 * Math.PI * k * n) / N
      re += buf[n] * Math.cos(a); im += buf[n] * Math.sin(a)
    }
    const mag = Math.sqrt(re * re + im * im)
    if (f < 1000) lo += mag
    else if (f < 5000) hi += mag
  }
  return hi > 0 ? 20 * Math.log10(lo / hi) : 0
}

function features(path: string) {
  const { pcm, sampleRate } = readWav(path)
  const BUF = 2048, hop = Math.round(sampleRate * 0.03)
  const frames: ProsodyFrame[] = []
  const tilts: number[] = []
  for (let i = 0; i + BUF < pcm.length; i += hop) {
    const s = pcm.slice(i, i + BUF)
    const db = rmsDb(s)
    frames.push({ t: 0, f0: detectPitch(s, sampleRate), db })
    if (db > -45) tilts.push(tilt(s.slice(0, 1024), sampleRate))
  }
  const voiced = frames.filter(f => f.f0 !== null).map(f => f.f0 as number)
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
  const audible = frames.filter(f => f.db > -50)
  const dur = pcm.length / sampleRate
  return {
    f0: Math.round(med(voiced)),
    tilt: Number(med(tilts).toFixed(1)),
    level: Number((audible.reduce((a, f) => a + f.db, 0) / (audible.length || 1)).toFixed(1)),
    rate: Number((audible.length / dur).toFixed(0)),  // voiced-frame density ≈ pace
  }
}

const pairs: [string, string, string][] = [
  ['pair 1', '/tmp/emp-w1.wav', '/tmp/emp-c1.wav'],
  ['pair 2', '/tmp/emp-w2.wav', '/tmp/emp-c2.wav'],
]
console.log('               pitch   tilt(lo/hi dB)  level   pace')
for (const [name, warm, cold] of pairs) {
  const w = features(warm), c = features(cold)
  console.log(`  ${name} WARM   ${String(w.f0).padStart(4)}Hz ${String(w.tilt).padStart(10)}   ${String(w.level).padStart(6)} ${String(w.rate).padStart(6)}`)
  console.log(`  ${name} CLIPPED${String(c.f0).padStart(4)}Hz ${String(c.tilt).padStart(10)}   ${String(c.level).padStart(6)} ${String(c.rate).padStart(6)}`)
  console.log(`         delta  ${String(w.f0 - c.f0).padStart(5)}  ${String((w.tilt - c.tilt).toFixed(1)).padStart(10)}   ${String((w.level - c.level).toFixed(1)).padStart(6)} ${String(w.rate - c.rate).padStart(6)}`)
}
