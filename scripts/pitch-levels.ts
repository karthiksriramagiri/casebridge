import { detectPitch } from '../app/venu/_lib/prosody'
const SR = 48000, N = 2048
function tone(freq: number, amp: number, harmonics = 3): Float32Array {
  const b = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let v = Math.sin((2 * Math.PI * freq * i) / SR)
    for (let h = 2; h <= harmonics + 1; h++) v += Math.sin((2 * Math.PI * freq * h * i) / SR) / h
    b[i] = v * amp
  }
  return b
}
console.log('  amplitude   detected (want 180Hz)')
for (const amp of [0.6, 0.3, 0.15, 0.08, 0.04, 0.02, 0.008, 0.002]) {
  const f = detectPitch(tone(180, amp), SR)
  const ok = f !== null && Math.abs(f - 180) < 6
  console.log(`  ${String(amp).padEnd(10)}  ${f === null ? 'null' : f.toFixed(1)}  ${ok ? '✓' : (amp < 0.004 ? '(below floor, fine)' : '✗ FAIL')}`)
}
