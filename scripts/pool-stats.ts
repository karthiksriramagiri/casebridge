import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
const byCat: Record<string, Record<string, number>> = {}
for (const s of NUANCE_SCENARIOS) {
  byCat[s.category] ??= {}
  byCat[s.category][s.disposition] = (byCat[s.category][s.disposition] ?? 0) + 1
}
console.log('CATEGORY'.padEnd(44) + 'qual notq  esc other')
for (const [c, d] of Object.entries(byCat)) {
  console.log(
    c.padEnd(44) +
    String(d.qualified ?? 0).padStart(4) +
    String(d.not_qualified ?? 0).padStart(5) +
    String(d.escalate ?? 0).padStart(5) +
    String((d.conditional ?? 0) + (d.screen ?? 0)).padStart(6)
  )
}
const oos = NUANCE_SCENARIOS.filter((s) =>
  /out-of-state|out of state|state-specific|prop 213|another state|by state/i.test(`${s.title} ${s.category}`)
)
console.log(`\nstate-rule / out-of-state flavoured: ${oos.length}`)
for (const s of oos) console.log('   ' + s.disposition.padEnd(14) + s.category.slice(0, 28).padEnd(30) + s.title.slice(0, 46))
