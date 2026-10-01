import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
import { NUANCE_LEADS, voiceFor } from '../app/venu/_lib/nuance-leads'
const males = NUANCE_SCENARIOS.filter((s) => (NUANCE_LEADS[s.id] as any)?.voiceGender === 'male').slice(0, 6)
for (const s of males) {
  const l = NUANCE_LEADS[s.id] as any
  console.log(`  ${(l.firstName + ' ' + l.lastName).padEnd(22)} male    → ${voiceFor(s.id).replace('aura-2-', '').replace('-en', '')}`)
}
const marcus = Object.entries(NUANCE_LEADS).find(([, l]) => (l as any).firstName === 'Marcus')
if (marcus) console.log(`\n  Marcus → ${voiceFor(marcus[0]).replace('aura-2-', '').replace('-en', '')} (${(marcus[1] as any).voiceGender})`)
