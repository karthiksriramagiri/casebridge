/* ═══════════════════════════════════════════════════════════════════════════
   What an ad name tells you.

     0817 | B0001SP_V1 | LHP_SP | BR  | RIP | A2 | B2 | GA-WIN
     0910 | B00084_IMG2| LHP    | IMG | RIP | MSG-RearEnd
     ^date ^creative id  ^firm    ^type      ^angle codes / message

   The naming convention is consistent enough to read format, language and
   state off it, which is what the filter row needs. Every field is optional:
   an unparseable name yields nulls rather than a wrong label, because a wrong
   filter is worse than a missing one.
   ═══════════════════════════════════════════════════════════════════════════ */

const FORMATS = ['UGC', 'HYB', 'IMG', 'BNR', 'BR', 'ANM', 'AIUGC'] as const

const STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
  'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
])

export type AdMeta = {
  format: string | null      // UGC | HYB | IMG | BNR | BR | ANM
  language: 'EN' | 'ES'
  state: string | null
  angle: string | null       // the trailing message/angle segment
  creativeId: string | null  // B00098_V1
}

export function parseAdName(name: string | null | undefined): AdMeta {
  const raw = (name || '').split('|').map(s => s.trim()).filter(Boolean)
  const upper = raw.map(s => s.toUpperCase())

  /* Spanish is carried on the firm segment (LHP_SP) rather than its own
     field, so it is read there and not from a language column that does not
     exist in the convention. */
  const language: 'EN' | 'ES' = upper.some(s => s.endsWith('_SP') || s === 'SP' || s.includes('SPANISH')) ? 'ES' : 'EN'

  const format = FORMATS.find(f => upper.includes(f)) ?? null

  // A state code can appear bare (GA) or prefixed on a variant (GA-WIN).
  let state: string | null = null
  for (const seg of upper) {
    const head = seg.split('-')[0]
    if (STATES.has(head)) { state = head; break }
  }

  const creativeId = raw.find(s => /^B\d{3,6}/i.test(s)) ?? null

  /* The angle is the last segment that is not an identifier, firm, format or
     state — in practice the MSG-* or hook-code tail. */
  const angle = [...raw].reverse().find(s => {
    const u = s.toUpperCase()
    if (u === creativeId?.toUpperCase()) return false
    if (FORMATS.includes(u as any)) return false
    if (STATES.has(u.split('-')[0])) return false
    if (/^\d+$/.test(u)) return false
    if (/^(LHP|LHP_SP|JM|EBL|BL|FL|JLL)$/.test(u)) return false
    return true
  }) ?? null

  return { format, language, state, angle, creativeId }
}
