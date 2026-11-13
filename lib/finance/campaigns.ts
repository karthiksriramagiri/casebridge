/* ═══════════════════════════════════════════════════════════════════════════
   Which campaigns belong to which firm.

   Ad accounts do not map one-to-one onto firms. Larry H. Parker runs two
   campaigns — LHP and LHP_SP — in the same account, and that account has
   carried other firms' campaigns before. Reading the account total and
   handing it to whoever is live on the account gets the right answer only
   for as long as nothing else is running in there, which is not a property
   anyone can see from the report.

   So the firm is read off the campaign name. Meta's names are pipe-
   delimited and the firm's code is one of the segments:

       CA | LHP    | Leads | FS | ABO | 20260508
       CA | LHP_SP | Leads | FS | ABO | 20260817
       CA | JM     | Leads | FS | ABO | 20260817

   A segment has to match a code exactly, which is what keeps LHP_SP out of
   LHP: one is not a prefix test of the other. Spend whose campaign matches
   no code is not dropped — it falls back to the account rule and is
   reported, because advertising that belongs to nobody is a thing to fix,
   not a thing to hide.

   Codes live here rather than in the firms table because they are a fact
   about how the ads are named, not about the firm, and because a new
   campaign needs them changed in the same commit that explains why.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Firm slug → the campaign codes that firm pays for. */
export const FIRM_CAMPAIGN_CODES: Record<string, string[]> = {
  /* Larry H. Parker: the main campaign and the SP (Spanish) one beside it.
     Both are the firm's, and both are billed to it. */
  lhp: ['LHP', 'LHP_SP'],
  jm: ['JM'],
  /* Archived firms, kept so historical spend still attributes if their
     campaigns are ever read again. */
  mca: ['MCA', 'GA_MCA'],
  eisenberg: ['ELG', 'EISENBERG'],
  thl: ['THL'],
  fl: ['FL', 'FEARS'],
}

/** The codes one firm answers to, or none when it has not been mapped. */
export function campaignCodesFor(slug: string): string[] {
  return FIRM_CAMPAIGN_CODES[slug] ?? []
}

/** The code inside a Meta campaign name, if any of the given ones match.
 *
 *  Exact, segment by segment: "CA | LHP_SP | Leads" carries LHP_SP and not
 *  LHP, which is the whole reason this is a match on segments rather than
 *  a substring test. */
export function codeInCampaign(campaignName: string, codes: string[]): string | null {
  const segments = String(campaignName || '')
    .split('|')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  for (const code of codes) {
    const want = code.trim().toUpperCase()
    if (segments.includes(want)) return code
  }
  return null
}
