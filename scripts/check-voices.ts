import { NUANCE_LEADS, voiceFor } from '../app/venu/_lib/nuance-leads'
import { NUANCE_SCENARIOS } from '../app/venu/_lib/nuance-scenarios'
const entries = Object.entries(NUANCE_LEADS)
const missing = entries.filter(([, l]) => !(l as any).voiceGender)
console.log(`  leads: ${entries.length}, missing voiceGender: ${missing.length}`)
const f = entries.filter(([, l]) => (l as any).voiceGender === 'female').length
console.log(`  female ${f} / male ${entries.length - f}`)
// Names that are obviously male but assigned a female voice, and vice versa.
const MALE = /^(marcus|michael|james|robert|david|john|carlos|luis|omar|yusuf|kevin|brian|derek|andre|felix|curtis|vince|dean|greg|roy|harold|marcus|anthony|hector|jamal|tyler|eric|frank|paul|sam|daniel|miguel|jose|victor|ray|gerald|walter|leon|otis|dwayne|terrence)$/i
const FEMALE = /^(maria|renata|denise|tanya|alicia|priya|olive|bethany|linda|susan|karen|nicole|angela|rosa|carmen|jessica|amber|dana|monica|sandra|teresa|yolanda|gloria|patricia|latoya|whitney|erica|crystal|vanessa)$/i
let mismatch = 0
for (const [id, l] of entries) {
  const first = (l as any).firstName?.split(' ')[0] ?? ''
  const g = (l as any).voiceGender
  if (MALE.test(first) && g !== 'male') { mismatch++; console.log(`  MISMATCH male name, female voice: ${first} (${id}) — ${NUANCE_SCENARIOS.find(s=>s.id===id)?.title.slice(0,40)}`) }
  if (FEMALE.test(first) && g !== 'female') { mismatch++; console.log(`  MISMATCH female name, male voice: ${first} (${id})`) }
}
console.log(`  obvious mismatches: ${mismatch}`)
console.log(`  sample voices: ${entries.slice(0, 4).map(([id, l]) => `${(l as any).firstName}=${voiceFor(id).replace('aura-2-','').replace('-en','')}`).join(', ')}`)
