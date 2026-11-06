import type { Creative } from './types'

/* ═══════════════════════════════════════════════════════════════════════════
   Constants the center needs that do not come from Meta.

   The 34 generated creatives that used to live here are gone — the center
   reads real ads from /api/creative/center/creatives now. What is left is the
   calendar the range filters are written against, and the competitor list,
   which is hand-curated rather than fetched.
   ═══════════════════════════════════════════════════════════════════════════ */

/* The prototype hardcoded this, which emptied every Today column the moment
   the date rolled over. It is live now, and pinned to the business day.

   It cannot read the browser's local date: this module would then answer
   differently on the server (Vercel runs UTC) than in the browser, and every
   date-dependent render would fail hydration — "Today" headings, the Missed
   pill on a launch, the T&Y window.

   It also cannot be UTC, which is what it used to be. Eastern runs five hours
   behind it, so from 7pm every evening UTC had already rolled into tomorrow:
   the whole page — spend, leads, signed, CPA — read zero against a date no
   data could exist for yet, for the last five hours of every working day.

   Naming the zone explicitly fixes both. Server and browser compute the same
   instant against the same zone, so hydration holds, and the calendar is the
   one the business already works to — the dialer's day, the shift reports and
   the pay periods are all Eastern. */
export const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export function addDays(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export const YESTERDAY = addDays(TODAY, -1)

/* Angles are read off real ad names by parseAdName, so the list is whatever
   the account is actually running. Derived in the store; this is only the
   fallback for the dialogs before the first load lands. */
export const ANGLES: string[] = []

export const EMPTY_CREATIVES: Creative[] = []

export const COMPETITORS = [
  {
    name: 'Crash Connect',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=thecrashconnect.com%2F&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc',
  },
  {
    name: 'Accident Aid Services',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&view_all_page_id=664214143438717',
  },
  {
    name: 'Accident Connect',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=CARACCIDENTSCONNECT.COM&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc',
  },
  {
    name: 'Accident Claim Evaluation',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=mycompensation360.com%2F&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc',
  },
  {
    name: 'Case Advisors',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=thecaseadvisors.com&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc',
  },
  {
    name: 'Collins Creatives',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&q=start.myaccidentcenter.com&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc',
  },
]
