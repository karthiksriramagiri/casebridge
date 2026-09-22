/**
 * Forces every lead to California unless the book's own story names another
 * state.
 *
 * The lead generator invented a state for each scenario, so reps were getting
 * Oregon and Tennessee cases that the book never described — and out-of-state
 * is an instant disqualification in a CA-only footprint, so those drills were
 * teaching nothing except "ask where it happened".
 */
import fs from 'node:fs'
import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'

const NAMES: Record<string, string> = {
  California: 'CA', Oregon: 'OR', Nevada: 'NV', Arizona: 'AZ', Texas: 'TX', Tennessee: 'TN',
  Ohio: 'OH', Georgia: 'GA', Kentucky: 'KY', Colorado: 'CO', Washington: 'WA', Michigan: 'MI',
  Alabama: 'AL', 'New Mexico': 'NM', Pennsylvania: 'PA', 'New York': 'NY', 'New Jersey': 'NJ',
}

const path = 'app/venu/_lib/nuance-leads.ts'
let src = fs.readFileSync(path, 'utf8')
const start = src.indexOf('= {') + 2
const end = src.lastIndexOf('}\n\nexport function') + 1
const leads = JSON.parse(src.slice(start, end))

let forced = 0, kept = 0
for (const s of NUANCE_SCENARIOS) {
  const hay = `${s.title} ${s.story} ${s.nuance} ${s.reason}`
  const named = Object.entries(NAMES).filter(([n]) => new RegExp(`\\b${n}\\b`).test(hay)).map(([, c]) => c)
  const lead = leads[s.id]
  if (!lead) continue
  if (named.length === 0 || named.includes('CA')) {
    if (lead.state !== 'CA') forced++
    lead.state = 'CA'
  } else {
    lead.state = named[0]
    kept++
  }
}
fs.writeFileSync(path, src.slice(0, start) + JSON.stringify(leads, null, 2) + src.slice(end))
console.log(`  forced to CA: ${forced}`)
console.log(`  left out-of-state (the book says so): ${kept}`)
