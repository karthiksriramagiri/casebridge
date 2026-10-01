import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
import { NUANCE_LEADS, voiceFor } from '../app/venu/_lib/nuance-leads'
// Spot-check a spread of male and female callers.
const picks = ['n1-1', 'n9-3', 'n2-1', 'n5-2', 'n12-3', 'n7-1']
for (const id of picks) {
  const s = NUANCE_SCENARIOS.find((x) => x.id === id)
  const l = NUANCE_LEADS[id] as any
  if (!s || !l) continue
  console.log(`  ${(l.firstName + ' ' + l.lastName).padEnd(22)} ${String(l.voiceGender).padEnd(7)} → ${voiceFor(id).replace('aura-2-', '').replace('-en', '')}`)
}
