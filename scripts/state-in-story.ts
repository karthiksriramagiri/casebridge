import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
import { NUANCE_LEADS } from '../app/venu/_lib/nuance-leads'
const NAMES: Record<string, string> = {
  California: 'CA', Oregon: 'OR', Nevada: 'NV', Arizona: 'AZ', Texas: 'TX', Tennessee: 'TN',
  Ohio: 'OH', Georgia: 'GA', Kentucky: 'KY', Colorado: 'CO', Washington: 'WA', Michigan: 'MI',
  Alabama: 'AL', 'New Mexico': 'NM', Pennsylvania: 'PA', 'New York': 'NY', 'New Jersey': 'NJ',
  Florida: 'FL', Illinois: 'IL', Virginia: 'VA', 'North Carolina': 'NC',
}
let explicit = 0, silent = 0
const conflicts: string[] = []
for (const s of NUANCE_SCENARIOS) {
  const hay = `${s.title} ${s.story} ${s.nuance} ${s.reason}`
  const found = Object.entries(NAMES).filter(([name]) => new RegExp(`\\b${name}\\b`).test(hay))
  const lead = NUANCE_LEADS[s.id]?.state
  if (found.length) {
    explicit++
    const codes = found.map(([, c]) => c)
    if (!codes.includes('CA')) conflicts.push(`${codes.join('/')} ${s.disposition.padEnd(14)} ${s.title.slice(0, 52)}`)
  } else {
    silent++
  }
}
console.log(`  stories that name a state explicitly: ${explicit}`)
console.log(`  stories that name none (state was invented by the lead generator): ${silent}`)
console.log(`\n  explicitly non-CA (${conflicts.length}):`)
for (const c of conflicts.slice(0, 20)) console.log('    ' + c)
