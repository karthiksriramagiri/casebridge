import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
import { NUANCE_LEADS } from '../app/venu/_lib/nuance-leads'
const byState: Record<string, { q: number; nq: number; other: number }> = {}
for (const s of NUANCE_SCENARIOS) {
  const st = NUANCE_LEADS[s.id]?.state ?? '??'
  byState[st] ??= { q: 0, nq: 0, other: 0 }
  if (s.disposition === 'qualified') byState[st].q++
  else if (s.disposition === 'not_qualified') byState[st].nq++
  else byState[st].other++
}
const rows = Object.entries(byState).sort((a, b) => (b[1].q + b[1].nq + b[1].other) - (a[1].q + a[1].nq + a[1].other))
console.log('  STATE  total   qualified  notqual  other')
for (const [st, d] of rows) {
  const t = d.q + d.nq + d.other
  console.log(`  ${st.padEnd(6)} ${String(t).padStart(5)} ${String(d.q).padStart(10)} ${String(d.nq).padStart(8)} ${String(d.other).padStart(6)}`)
}
const nonCA = NUANCE_SCENARIOS.filter(s => (NUANCE_LEADS[s.id]?.state ?? 'CA') !== 'CA')
const nonCAQualified = nonCA.filter(s => s.disposition === 'qualified')
console.log(`\n  non-CA scenarios: ${nonCA.length} of ${NUANCE_SCENARIOS.length}`)
console.log(`  of those, the book calls QUALIFIED: ${nonCAQualified.length}  ← these conflict with a CA-only footprint`)
for (const s of nonCAQualified.slice(0, 8)) console.log(`     ${(NUANCE_LEADS[s.id]?.state ?? '').padEnd(3)} ${s.title.slice(0, 58)}`)
