/* ═══════════════════════════════════════════════════════════════════════════
   Creative naming codes — one source of truth

   Every ad name is pipe-delimited and carries its firm, its format and the
   two hooks it was built from:

     0826 | B00090_BNR1 | LHP | BNR | G1 | H4 | GA-WIN
                                ^^^   ^^  ^^
                             format  vis  verb

   The lookup tables were previously inline in /api/metrics/angles; they live
   here so the angles report and the creative-analysis winners read the same
   labels. A code with no entry falls back to the raw code rather than being
   dropped — an unnamed hook is still a real hook.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Angle lookup tables ─────────────────────────────────────────────────────
// BR-AD angle (A = visual, B = verbal)
export const VISUAL_HOOKS: Record<string, string> = {
  // BR-AD visual hooks
  A1:  'Skeleton',
  A2:  'Animated Surgery',
  A3:  'Accident',
  A4:  'Check',
  A5:  'New Car',
  A6:  'Split View (Half Screen)',
  A7:  'State Map',
  A8:  'Check & Talking Head (Bold Guy)',
  A9:  'Check & Talking Head (Working Woman)',
  A10: 'Animal',
  A11: 'Attention Hook',
  A12: 'Animated Bone',
  A13: 'Simulation Crash',
  // HYB-AD visual hooks
  C1:  'Black 30ish Lady Talking Head',
  C2:  'Bold Old Guy',
  C3:  'White Man',
  // AIUGC-AD visual hooks
  E1:  'In the Car',
  E2:  'Gas Station',
  E3:  'Gym',
  E4:  'Black AI Avatar',
  E5:  'Latino AI Avatar',
  // BNR-AD visual hooks
  G1:  'Accident',
  G2:  'Car Driving',
  // ANM-AD visual hooks (placeholder)
  // IMG-AD visual hooks (placeholder)
}

export const VERBAL_HOOKS: Record<string, string> = {
  // BR-AD verbal hooks
  B1:  'Insurance Company',
  B2:  "They don't want you to know",
  B3:  'Never Sue',
  B4:  'New Claim Tool',
  B5:  'How I got new car',
  B6:  'Music Only',
  B7:  'Looking for 10 accident victims',
  B8:  'Understand your options (Educational)',
  B9:  'You may be owed a bigger check',
  B10: 'Injuries take days to appear',
  B11: 'Miss out on money',
  B12: 'Do I have to sue to get paid',
  B13: 'Passenger Angle',
  B14: '3 Mistakes',
  B15: 'Eligible for a bigger payout',
  B16: 'Do Not Call Attorney',
  B17: 'Been in car accident and did not go to the hospital',
  B18: "Didn't Go To ER",
  B19: "Insurance Company doesn't care you go to ER",
  B20: 'This is Viral Hack',
  B21: "Don't Accept first check from insurance",
  B22: 'Think you are fine after car accident no ER no AMB',
  B23: 'Never do this 3 things',
  B24: 'Never call insurance yourself',
  B25: 'Just Now feeling the pain',
  B26: 'Old lady crushed and said I ran green light',
  B27: 'Car looks like this Body feels like this',
  // HYB-AD verbal hooks
  D1:  'Settlement Comparison',
  D2:  'You will regret suing the person who hit you in a car accident',
  D3:  'If you skipped ER after your car accident',
  // AIUGC-AD verbal hooks
  F1:  'I need to tell you something (Whisper)',
  F2:  'How much did you get for the little accident',
  F3:  'First day back at gym after my accident',
  F4:  'Settlement Amount Comparison',
  // BNR-AD verbal hooks
  H1:  "Didn't go to the ER",
  H2:  'Never Sue the person who hit you',
  H3:  'I almost let insurance settle my accident for',
  H4:  "I didn't know there were two checks you could get",
  H5:  'Drink Driver hit my car (BNR)',
  H6:  'Biggest Mistake',
}

// Which angle type each letter prefix belongs to
export const ANGLE_TYPE_BY_PREFIX: Record<string, string> = {
  A: 'BR-AD', B: 'BR-AD',
  C: 'HYB-AD', D: 'HYB-AD',
  E: 'AIUGC-AD', F: 'AIUGC-AD',
  G: 'BNR-AD', H: 'BNR-AD',
  I: 'ANM-AD', J: 'ANM-AD',
  K: 'IMG-AD', L: 'IMG-AD',
}

/* ── Ad format ──────────────────────────────────────────────────────────────
   The segment naming the production style. BR is the default house format,
   so an ad with no format segment is not guessed at — it reads as unknown. */

export const FORMAT_LABEL: Record<string, string> = {
  BR:    'Broll',
  HYB:   'Hybrid',
  AIUGC: 'AI UGC',
  UGC:   'UGC',
  BNR:   'Banner',
  ANM:   'Animation',
  IMG:   'Static image',
  VIDEO: 'Video',
}

const FORMAT_CODES = Object.keys(FORMAT_LABEL)

export interface AdCodes {
  segments:   string[]
  /** The ad's own identity — batch number and creative id, without the tags. */
  shortName:  string
  /** Everything after the identity: firm, format, hook codes. */
  tags:       string[]
  format:     string | null
  formatLabel: string | null
  visualCode: string | null
  visualLabel: string | null
  /** False when the code carries no entry in the table — the label is then
      the bare code, which is an identifier, not a description of the hook. */
  visualKnown: boolean
  verbalCode: string | null
  verbalLabel: string | null
  verbalKnown: boolean
}

/** Pull every code we understand out of one ad name. */
export function adCodes(adName: string | null | undefined): AdCodes {
  const segments = (adName || '').split('|').map(s => s.trim()).filter(Boolean)
  const upper    = segments.map(s => s.toUpperCase())

  const format = FORMAT_CODES.find(c => upper.includes(c)) ?? null

  let visualCode: string | null = null
  let verbalCode: string | null = null
  for (const part of upper) {
    // 1–50 only: a batch id like "B00090" must not read as verbal hook B9.
    if (/^[ACEGIK]\d+$/.test(part)) {
      const n = parseInt(part.slice(1), 10)
      if (n >= 1 && n <= 50) visualCode = part
    }
    if (/^[BDFHJL]\d+$/.test(part)) {
      const n = parseInt(part.slice(1), 10)
      if (n >= 1 && n <= 50) verbalCode = part
    }
  }

  return {
    segments,
    shortName: segments.slice(0, 2).join(' | ') || (adName || '').trim(),
    tags: segments.slice(2),
    format,
    formatLabel: format ? FORMAT_LABEL[format] : null,
    visualCode,
    visualLabel: visualCode ? (VISUAL_HOOKS[visualCode] ?? visualCode) : null,
    visualKnown: !!(visualCode && VISUAL_HOOKS[visualCode]),
    verbalCode,
    verbalLabel: verbalCode ? (VERBAL_HOOKS[verbalCode] ?? verbalCode) : null,
    verbalKnown: !!(verbalCode && VERBAL_HOOKS[verbalCode]),
  }
}
