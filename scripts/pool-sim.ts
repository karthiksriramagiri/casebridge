import { NUANCE_SCENARIOS, randomScenario } from '../app/venu/_lib/nuance-scenarios'
const NON_MVA = new Set(['Slip & Fall', 'Premise Liability', 'Dog Bites & Non-Bite Dog Injuries', 'Natural Occurrences'])
const STATE = new Set(['Prop 213 & State-Specific Rules', 'Minors (By State)'])
function bucket(s: any) {
  if (STATE.has(s.category) || /out-of-state|out of state|another state/i.test(s.title)) return 'state-rule'
  if (NON_MVA.has(s.category)) return 'not a car accident'
  if (s.disposition === 'qualified') return 'car · QUALIFIED'
  if (s.disposition === 'not_qualified') return 'car · NOT QUALIFIED'
  return 'car · escalate/other'
}
function tally(pick: () => any, n: number) {
  const c: Record<string, number> = {}
  for (let i = 0; i < n; i++) { const b = bucket(pick()); c[b] = (c[b] ?? 0) + 1 }
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round((v / n) * 100)]))
}
const N = 20000
const before = tally(() => NUANCE_SCENARIOS[Math.floor(Math.random() * NUANCE_SCENARIOS.length)], N)
const after = tally(() => randomScenario(), N)
const keys = ['car · QUALIFIED', 'car · NOT QUALIFIED', 'car · escalate/other', 'state-rule', 'not a car accident']
console.log('  ' + 'BUCKET'.padEnd(24) + 'before   after')
for (const k of keys) {
  console.log('  ' + k.padEnd(24) + String((before[k] ?? 0) + '%').padStart(6) + String((after[k] ?? 0) + '%').padStart(8))
}
