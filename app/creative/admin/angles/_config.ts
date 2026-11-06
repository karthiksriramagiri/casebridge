/* The six angle families, and the code range each owns.

   Every creative is a visual hook paired with a verbal one, and the letter
   pair says which family it came out of: A/B is Branded, C/D is Hybrid, and
   so on. The visual letter is always the odd one. */
export const ANGLE_FAMILIES = [
  { id: 'BR-AD',    label: 'Branded',  codes: 'A–B', visual: 'A', verbal: 'B' },
  { id: 'HYB-AD',   label: 'Hybrid',   codes: 'C–D', visual: 'C', verbal: 'D' },
  { id: 'AIUGC-AD', label: 'AI UGC',   codes: 'E–F', visual: 'E', verbal: 'F' },
  { id: 'BNR-AD',   label: 'Banner',   codes: 'G–H', visual: 'G', verbal: 'H' },
  { id: 'ANM-AD',   label: 'Animated', codes: 'I–J', visual: 'I', verbal: 'J' },
  { id: 'IMG-AD',   label: 'Image',    codes: 'K–L', visual: 'K', verbal: 'L' },
] as const

export type AngleFamily = (typeof ANGLE_FAMILIES)[number]

export const DATE_PRESETS = [
  { label: 'All time', value: 'maximum' },
  { label: '30d', value: 'last_30d' },
  { label: '14d', value: 'last_14d' },
  { label: '7d', value: 'last_7d' },
]

/* A hook is judged before the pipeline has had a chance to dilute it, so the
   bands here are tighter than the account-level ones on the Ops dashboard. */
export const CPL_GOOD = 120
export const CPL_WARN = 200
export const CPQ_GOOD = 600
export const CPQ_WARN = 900

export type PipelineLead = {
  name: string | null
  phone: string | null
  email: string | null
  createdAt: string | null
}

export type AngleStat = {
  code: string
  name: string
  spend: number
  leads: number
  signedCases: number
  nrCount: number
  nqCount: number
  fuCount: number
  chaseCount: number
  nrLeads: PipelineLead[]
  nqLeads: PipelineLead[]
  fuLeads: PipelineLead[]
  chaseLeads: PipelineLead[]
  adCount: number
  cpl: number | null
  /* The API calls this `cpa` and expresses conversionRate as a percentage
     (13.4, not 0.134). Both are recomputed in the page from spend, leads and
     signed cases so the totals row and the per-row figures cannot disagree
     with each other — these are here to describe the payload accurately, not
     because the page leans on them. */
  cpa: number | null
  conversionRate: number | null
}

export type ComboStat = AngleStat & { visualCode: string; verbalCode: string }

export type AnglesData = {
  visual: AngleStat[]
  verbal: AngleStat[]
  combos: ComboStat[]
  unparsedAds: number
  unparsedSpend: number
  aiAnalysis: string | null
  analyzedAt: string | null
}

export type StageKey = 'nr' | 'nq' | 'fu' | 'chase'

export const STAGES: { key: StageKey; label: string; short: string; leads: keyof AngleStat; count: keyof AngleStat }[] = [
  { key: 'nr',    label: 'No response',   short: 'No',     leads: 'nrLeads',    count: 'nrCount' },
  { key: 'nq',    label: 'Not qualified', short: 'Not',    leads: 'nqLeads',    count: 'nqCount' },
  { key: 'fu',    label: 'Follow up',     short: 'Follow', leads: 'fuLeads',    count: 'fuCount' },
  { key: 'chase', label: 'Chase',         short: 'Chase',  leads: 'chaseLeads', count: 'chaseCount' },
]
