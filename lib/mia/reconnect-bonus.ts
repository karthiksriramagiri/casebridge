/* ═══════════════════════════════════════════════════════════════════════════
   A quarter of the commission, moved from the closer to whoever got them back.

   A signed case that goes quiet is money already booked and walking out. The
   closer is usually busy closing; the rep who works the MIA board and gets
   through is the one who saves it. So a quarter of that case's commission
   moves across: the reconnector gains 25%, the closer keeps 75%.

   It is a SPLIT, not a bonus. The case still pays exactly what it always
   paid — the same $30, $40 or $50 — and the only question is who collects
   it. Nothing here creates money, so the two halves must always add back to
   the whole; that is what the arithmetic below is for.

   Three things have to be true before anything moves:

     someone reconnected it   reconnected_by_id and reconnected_at are set
     it was not the closer    reconnecting your own case is just finishing it
     the case actually paid   it has to resolve to a signed lead with a rate

   The rate is the case's own tier, not the reconnector's. A case closed as
   somebody's 30th of the month paid $50, so saving it moves $12.50 —
   whatever tier the rep doing the saving happens to be on themselves.
   ═══════════════════════════════════════════════════════════════════════════ */

import { tierCommission } from '@/lib/pay'

/** The share of a case's commission that moves to the reconnecting rep. */
export const RECONNECT_SHARE = 0.25

/** The reconnector's share, in whole cents. $30 → 750, $40 → 1000, $50 → 1250. */
export function reconnectBonusCents(tierRate: number): number {
  return Math.round(tierRate * RECONNECT_SHARE * 100)
}

/* What the closer is left with — the remainder, not an independent sum.

   Taking 75% directly would let rounding lose or invent a cent on a rate
   that does not divide cleanly. Subtracting from the whole means the two
   shares always add back to exactly what the case paid, whatever the rate. */
export function closerShareCents(tierRate: number): number {
  return Math.round(tierRate * 100) - reconnectBonusCents(tierRate)
}

export interface ReconnectBonus {
  caseId:       string
  name:         string
  /** The full commission the case paid its closer. */
  caseRate:     number
  tier:         number
  /** What moves to the reconnecting rep, in dollars. */
  amount:       number
  /** What the closer is left with on this case, in dollars. */
  closerKeeps:  number
  closerName:   string | null
  reconnectedAt: string
  /** The month the bonus belongs to, YYYY-MM — the month the case signed. */
  monthKey:     string
}

/* Which close of its closer's month a case was.

   The tier resets monthly and is decided by order of signing, so a case's
   rate is a property of its closer's month and not of the case alone. Worked
   out from the same rule the pay page uses: non-replacement signed cases,
   oldest first, deduped by name and day.
*/
function closeNumberWithin(
  leads: { contact_name: string | null; qualified_at: string | null; case_status: string | null }[],
  target: { contact_name: string | null; qualified_at: string | null },
): number {
  const month = String(target.qualified_at ?? '').slice(0, 7)
  const seen = new Set<string>()
  const ordered = leads
    .filter(l => l.qualified_at && String(l.qualified_at).slice(0, 7) === month)
    .filter(l => (l.case_status || '').toLowerCase() !== 'replacement')
    .sort((a, b) => String(a.qualified_at).localeCompare(String(b.qualified_at)))
    .filter(l => {
      const key = `${(l.contact_name || '').toLowerCase()}|${String(l.qualified_at).slice(0, 10)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  const key = `${(target.contact_name || '').toLowerCase()}|${String(target.qualified_at).slice(0, 10)}`
  const idx = ordered.findIndex(
    l => `${(l.contact_name || '').toLowerCase()}|${String(l.qualified_at).slice(0, 10)}` === key,
  )
  // Not found means the case is not in its closer's counted set; treat it as
  // the first close rather than inventing a higher tier.
  return idx >= 0 ? idx + 1 : 1
}

/** Is this rep the person who closed the case? Ids when we have them, names
 *  otherwise — `closer_id` is null on most rows and the name is what's set. */
function isTheCloser(
  row: { closer_id: string | null; closer: string | null },
  profileId: string,
  profileName: string,
): boolean {
  if (row.closer_id) return row.closer_id === profileId
  const a = String(row.closer ?? '').trim().toLowerCase()
  const b = String(profileName ?? '').trim().toLowerCase()
  return a.length > 0 && a === b
}

/* Every reconnection bonus owed to one rep.

   Returns [] rather than throwing when the migration has not been run — the
   columns are missing, nobody has been credited with anything yet, and a pay
   page that will not load is a worse answer than one showing no bonuses.
*/
export async function reconnectBonusesFor(
  admin: any,
  profileId: string,
  profileName: string,
): Promise<ReconnectBonus[]> {
  const { data: cases, error } = await admin
    .from('mia_cases')
    .select('id, name, lead_id, closer, closer_id, reconnected_by_id, reconnected_at')
    .eq('reconnected_by_id', profileId)
    .not('reconnected_at', 'is', null)

  if (error || !cases?.length) {
    if (error && !/column .* does not exist|schema cache/i.test(error.message || '')) {
      console.error('[mia:bonus]', error.message)
    }
    return []
  }

  const earned = cases.filter((c: any) => !isTheCloser(c, profileId, profileName))
  if (!earned.length) return []

  const leadIds = earned.map((c: any) => c.lead_id).filter(Boolean)
  if (!leadIds.length) return []

  const { data: leads } = await admin
    .from('ghl_leads')
    .select('id, contact_name, closer, closed_by_profile_id, qualified_at, case_status')
    .in('id', leadIds)
  const leadById = new Map<string, any>((leads ?? []).map((l: any) => [String(l.id), l]))

  /* The closer's whole month, because the tier is decided by where the case
     falls in it. One query per distinct closer, not one per case. */
  const closers: string[] = [...new Set<string>((leads ?? []).map((l: any) => String(l.closer ?? '').trim()).filter(Boolean))]
  const monthByCloser = new Map<string, any[]>()
  for (const name of closers) {
    const { data: theirs } = await admin
      .from('ghl_leads')
      .select('contact_name, qualified_at, case_status')
      .ilike('closer', name)
      .not('qualified_at', 'is', null)
    monthByCloser.set(name.toLowerCase(), theirs ?? [])
  }

  const out: ReconnectBonus[] = []
  for (const c of earned) {
    const lead = leadById.get(String(c.lead_id))
    if (!lead?.qualified_at) continue

    const closerName = String(lead.closer ?? '').trim()
    const theirMonth = monthByCloser.get(closerName.toLowerCase()) ?? []
    const closeNumber = closeNumberWithin(theirMonth, lead)
    const { tier, rate } = tierCommission(closeNumber)

    out.push({
      caseId: String(c.id),
      name: c.name ?? lead.contact_name ?? 'Unknown',
      caseRate: rate,
      tier,
      amount: reconnectBonusCents(rate) / 100,
      closerKeeps: closerShareCents(rate) / 100,
      closerName: closerName || c.closer || null,
      reconnectedAt: String(c.reconnected_at),
      monthKey: String(lead.qualified_at).slice(0, 7),
    })
  }

  out.sort((a, b) => b.reconnectedAt.localeCompare(a.reconnectedAt))
  return out
}

/* The other side of the split: what a closer gives up.

   Looked up by lead id, because that is what a closed case is keyed on
   everywhere else. Only cases somebody ELSE reconnected appear — a closer
   who got their own case back gives up nothing.

   Returns an empty map when the migration has not been run, which reads as
   "nobody has reconnected anything", and leaves every commission whole.
*/
export async function reconnectDeductionsFor(
  admin: any,
  closerProfileId: string,
  closerName: string,
  leadIds: string[],
): Promise<Map<string, { share: number; reconnectedByName: string | null }>> {
  const out = new Map<string, { share: number; reconnectedByName: string | null }>()
  if (!leadIds.length) return out

  const rows: any[] = []
  for (let i = 0; i < leadIds.length; i += 200) {
    const { data, error } = await admin
      .from('mia_cases')
      .select('lead_id, closer, closer_id, reconnected_by_id, reconnected_by, reconnected_at')
      .in('lead_id', leadIds.slice(i, i + 200))
      .not('reconnected_by_id', 'is', null)
      .not('reconnected_at', 'is', null)
    if (error) {
      if (!/column .* does not exist|schema cache/i.test(error.message || '')) {
        console.error('[mia:deduction]', error.message)
      }
      return out
    }
    rows.push(...(data ?? []))
  }

  for (const r of rows) {
    if (!r.lead_id) continue
    // The rep who reconnected it is the one being paid; if that is this
    // closer, nothing moves.
    if (r.reconnected_by_id === closerProfileId) continue
    // And only deduct from the person who actually closed it.
    if (!isTheCloser(r, closerProfileId, closerName)) continue
    out.set(String(r.lead_id), {
      share: RECONNECT_SHARE,
      reconnectedByName: r.reconnected_by ?? null,
    })
  }
  return out
}
