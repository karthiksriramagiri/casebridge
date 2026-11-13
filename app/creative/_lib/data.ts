import type { Creative } from './types'
import { creativeDay } from '@/lib/creative-day'

/* ═══════════════════════════════════════════════════════════════════════════
   Constants the center needs that do not come from Meta.

   The 34 generated creatives that used to live here are gone — the center
   reads real ads from /api/creative/center/creatives now. What is left is the
   calendar the range filters are written against, and the competitor list,
   which is hand-curated rather than fetched.
   ═══════════════════════════════════════════════════════════════════════════ */

/* The prototype hardcoded this, which emptied every Today column the moment
   the date rolled over. It is live now, and pinned to the Creative Center's
   working day.

   It cannot read the browser's local date: this module would then answer
   differently on the server (Vercel runs UTC) than in the browser, and every
   date-dependent render would fail hydration — "Today" headings, the Missed
   pill on a launch, the T&Y window.

   It also cannot be UTC, which is what it used to be. A zone behind UTC rolls
   over hours later, so from the evening onwards UTC had already moved into
   tomorrow: the whole page — spend, leads, signed, CPA — read zero against a
   date no data could exist for yet, for the last hours of every working day.

   Pacific, not Eastern. The rest of CaseBridge runs on an Eastern day — the
   dialer, the shift reports, the pay periods — but the Creative Center's day
   is its own, which is when the ad meeting's lists roll and when Watch List
   Mode's dismissals clear. Holding the lists on Eastern and the dismissals on
   Pacific meant that for three hours every night the watch list had already
   moved to tomorrow while the day's dismissals were still on yesterday. One
   zone for the whole center.

   Worth knowing when reading these numbers: Meta reports its daily rows in
   each ad account's own timezone, which this does not control. The closer the
   accounts are set to Pacific, the more exactly a "today" here lines up with
   a "today" in Ads Manager. */

/* The rollover itself lives in lib/creative-day, so the routes can read the
   same rule without importing a client module. Re-exported here because
   every page in the center already imports its dates from this file. */
export { DAY_ROLLOVER_HOUR, creativeDay as pacificDay } from '@/lib/creative-day'

/* TODAY is a module constant, fixed at the moment the bundle first
   evaluates; a tab left open overnight would keep writing into yesterday.
   Anything that has to notice the roll-over calls `pacificDay()` instead —
   the store re-reads it on a timer and every page follows that. */
export const TODAY = creativeDay()

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
