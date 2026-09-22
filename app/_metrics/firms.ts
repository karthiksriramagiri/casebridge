/* ═══════════════════════════════════════════════════════════════════════════
   Firm codes

   Every ad name is pipe-delimited and carries the firm it runs for:

     0817 | B0001SP_V1 | LHP_SP | BR | RIP | A2 | B2 | GA-WIN
                         ^^^^^^
     0910 | B00084_IMG2 | LHP | IMG | RIP | MSG-RearEnd
                          ^^^

   It is usually the third segment, but the position is not guaranteed across
   older naming, so every segment is checked against the known set instead.
   ═══════════════════════════════════════════════════════════════════════════ */

export const FIRMS = [
  { code: 'LHP',    label: 'LHP' },
  { code: 'LHP_SP', label: 'LHP_SP' },
  { code: 'JM',     label: 'JM' },
  { code: 'EBL',    label: 'EBL' },
  { code: 'BL',     label: 'BL' },
]

/* Longest first: "LHP_SP" must win before "LHP" can match a prefix of it, and
   "BL" must not swallow a segment that is really "EBL". */
const BY_LENGTH = [...FIRMS].sort((a, b) => b.code.length - a.code.length)

export const UNKNOWN_FIRM = '—'

export function firmOf(adName: string | null | undefined): string {
  if (!adName) return UNKNOWN_FIRM
  const segments = adName.split('|').map(s => s.trim().toUpperCase())
  for (const f of BY_LENGTH) {
    if (segments.includes(f.code)) return f.code
  }
  return UNKNOWN_FIRM
}
