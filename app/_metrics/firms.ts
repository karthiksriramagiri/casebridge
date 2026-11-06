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

/* `label` is the code as the legacy center's firm tabs have always shown it.
   `name` is the firm as a person would say it, used by the Creative Center.
   Both are kept so renaming for one surface cannot silently relabel the other.

   JM_SP and FL were missing here. firmOf matches a whole pipe segment, so
   "JM_SP" never matched "JM" — it fell through to UNKNOWN_FIRM, leaving 14
   Spanish Jacoby & Meyers ads and 4 FL ads unattributed in every report that
   groups by firm. Adding them fixes that for the legacy center too. */
export const FIRMS = [
  { code: 'LHP',    label: 'LHP',    name: 'Larry H. Parker' },
  { code: 'LHP_SP', label: 'LHP_SP', name: 'Larry H. Parker [SPANISH]' },
  { code: 'JM',     label: 'JM',     name: 'Jacoby & Meyers' },
  { code: 'JM_SP',  label: 'JM_SP',  name: 'Jacoby & Meyers [SPANISH]' },
  // No full name supplied for these yet — they show as their code until one is.
  { code: 'FL',     label: 'FL',     name: 'FL' },
  { code: 'EBL',    label: 'EBL',    name: 'EBL' },
  { code: 'BL',     label: 'BL',     name: 'BL' },
]

/** The firm as a person would say it; falls back to the code, then to a dash. */
export function firmName(code: string | null | undefined): string {
  if (!code) return UNKNOWN_FIRM
  return FIRMS.find(f => f.code === code)?.name ?? code
}

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
