import { NextRequest, NextResponse } from 'next/server'

/* ═══════════════════════════════════════════════════════════════════════════
   One row's full daily history.

   The insights route carries a fixed 14-day series because that is the window
   the KEEP/WATCH/KILL verdicts compare against, and pulling lifetime history
   for every ad in the account on every page load would be slow for data that
   is mostly unread.

   The chart wants the opposite: for the one creative someone clicked, every
   day since it launched. Correlations over two weeks are noise; over a
   creative's whole life they start to mean something, and the shape of a
   fatigue curve only shows up across its full run.
   ═══════════════════════════════════════════════════════════════════════════ */

import { adAccounts, accountByKey } from '@/app/_metrics/ad-accounts'

const BASE = 'https://graph.facebook.com/v25.0'

/* A row id belongs to exactly one account, and only that account's token can
   read it. The caller passes the account key it got from /insights; without
   one, every configured token is tried in turn rather than assuming the
   first. */
function tokensToTry(key: string | null): string[] {
  const named = accountByKey(key)
  if (named) return [named.token]
  return adAccounts().map(a => a.token)
}

export const dynamic = 'force-dynamic'

const FIELDS = [
  'spend', 'impressions', 'frequency', 'cpm',
  'inline_link_clicks', 'inline_link_click_ctr', 'cost_per_inline_link_click',
  'actions', 'video_play_actions',
].join(',')

const num = (v: any) => {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}
const actionVal = (arr: any[] = [], type: string) =>
  parseInt(arr?.find((a: any) => a.action_type === type)?.value || '0', 10)

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const level = req.nextUrl.searchParams.get('level') || 'ad'
  const account = req.nextUrl.searchParams.get('account')
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const tokens = tokensToTry(account)
  if (tokens.length === 0) return NextResponse.json({ days: [] })

  /** Pull the whole paginated series with one account's token. */
  async function fetchAll(token: string): Promise<{ rows: any[]; error: string | null }> {
    const url = new URL(`${BASE}/${id}/insights`)
    url.searchParams.set('access_token', token)
    url.searchParams.set('fields', FIELDS)
    url.searchParams.set('level', level)
    url.searchParams.set('time_increment', '1')
    // Lifetime. Meta caps `maximum` at 37 months, which outlives any creative here.
    url.searchParams.set('date_preset', 'maximum')
    url.searchParams.set('limit', '500')

    const out: any[] = []
    let next: string | null = url.toString()
    // Paginate: a creative running six months is past the 500-row page size.
    while (next && out.length < 2000) {
      const res: any = await fetch(next, { next: { revalidate: 900 } })
      const json = await res.json()
      if (json?.error) return { rows: [], error: json.error.message }
      out.push(...(json.data || []))
      next = json.paging?.next ?? null
    }
    return { rows: out, error: null }
  }

  try {
    let rows: any[] = []
    let lastError: string | null = null
    for (const token of tokens) {
      const r = await fetchAll(token)
      if (r.rows.length) { rows = r.rows; lastError = null; break }
      lastError = r.error
    }
    if (!rows.length && lastError) {
      return NextResponse.json({ error: lastError, days: [] }, { status: 502 })
    }

    const days = rows
      .map(r => {
        const spend = num(r.spend)
        const impressions = num(r.impressions)
        const linkClicks = r.inline_link_clicks != null
          ? num(r.inline_link_clicks)
          : actionVal(r.actions, 'link_click')
        const leads = actionVal(r.actions, 'lead')
          || actionVal(r.actions, 'offsite_conversion.fb_pixel_lead')
        /* 3-second views, the same numerator the hook rate benchmark uses —
           `video_play_actions` counts autoplay starts and reads ~90% for
           everything. */
        const plays3s = actionVal(r.actions, 'video_view')
          || actionVal(r.video_play_actions, 'video_view')

        return {
          date: r.date_start,
          spend,
          impressions,
          linkClicks,
          leads,
          frequency: r.frequency != null ? num(r.frequency) : null,
          cpl: leads > 0 ? spend / leads : null,
          linkCtr: r.inline_link_click_ctr != null
            ? num(r.inline_link_click_ctr)
            : (impressions > 0 ? (linkClicks / impressions) * 100 : null),
          linkCpc: r.cost_per_inline_link_click != null
            ? num(r.cost_per_inline_link_click)
            : (linkClicks > 0 ? spend / linkClicks : null),
          hookRate: impressions > 0 && plays3s > 0 ? (plays3s / impressions) * 100 : null,
          leadCvr: linkClicks > 0 ? (leads / linkClicks) * 100 : null,
        }
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    return NextResponse.json({
      days,
      // First day with delivery — the launch date as the account experienced it.
      launchedAt: days[0]?.date ?? null,
      totalDays: days.length,
    })
  } catch (err) {
    console.error('[creative:series]', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message, days: [] }, { status: 500 })
  }
}
