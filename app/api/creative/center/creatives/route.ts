import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adAccounts, type AdAccount } from '@/app/_metrics/ad-accounts'
import { parseAdName } from '@/app/_metrics/ad-meta'
import { firmOf } from '@/app/_metrics/firms'

/* ═══════════════════════════════════════════════════════════════════════════
   Live creatives for the Creative Center.

   The revamped center models an ad as a name plus a daily series and derives
   every number from that series — T&Y CPL, the 3/5/7/14/30-day strip, week on
   week, spend since last lead. /api/creative/insights cannot feed it: that one
   returns a pre-aggregated row for a chosen range plus a fixed 14-day trend,
   which is the right shape for the legacy funnel and the wrong one here.

   So this asks Meta for one row per ad PER DAY over a lookback window and
   hands back the window itself. Every range the center offers is then a filter
   over that array, computed client-side, with no second round trip when the
   date picker moves.

   Read-only by construction. Nothing here can write to Meta — the center
   advises, a human acts in Ads Manager.
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE = 'https://graph.facebook.com/v25.0'

export const dynamic = 'force-dynamic'

const FIELDS = [
  'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
  'spend', 'impressions', 'inline_link_clicks',
  'actions', 'video_play_actions',
].join(',')

const num = (v: any) => {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

const actionVal = (arr: any[] = [], type: string) =>
  parseInt(arr?.find((a: any) => a.action_type === type)?.value || '0', 10)

const leadsOf = (actions: any[] = []) =>
  actionVal(actions, 'lead') || actionVal(actions, 'offsite_conversion.fb_pixel_lead')

/* UTC, matching TODAY in _lib/data.ts. The two have to agree on what day it
   is or the client filters a window whose edges it disagrees with — "Today"
   would read empty on the very rows this just fetched. */
function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

async function metaGet(url: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(url, { next: { revalidate: 300 }, signal: ctrl.signal })
    const json = await res.json()
    if (!res.ok || json?.error) {
      return { data: [], error: json?.error?.message || `HTTP ${res.status}` }
    }
    return json
  } catch (err) {
    return { data: [], error: (err as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

/** Follows paging.next. A 30-day daily series over a busy account runs past
    one page, and a truncated series silently shortens every trend. */
async function metaAll(token: string, path: string, params: Record<string, string>, maxPages = 12) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const out: any[] = []
  let next: string | null = url.toString()
  let pages = 0
  let error: string | null = null

  while (next && pages < maxPages) {
    const json: any = await metaGet(next)
    if (json.error) { error = json.error; break }
    out.push(...(json.data || []))
    next = json.paging?.next ?? null
    pages++
  }
  return { data: out, error, truncated: !!next }
}

/* Budgets, and whether the thing is actually switched on.

   Spend is a proxy for "is this live" and not a very good one: an ad switched
   on an hour ago has not spent yet, and one paused at noon spent all morning.
   Meta will answer the question directly, so ask it.

   `effective_status` is the field that matters rather than `status`. `status`
   is the ad's own switch, while `effective_status` rolls its parents in — an
   ad left ON inside a paused ad set reports ADSET_PAUSED, which is the truth
   about delivery. Only ACTIVE means it is running; PAUSED, ADSET_PAUSED,
   CAMPAIGN_PAUSED, ARCHIVED and the review states all mean it is not. */
async function budgetsFor(acct: AdAccount) {
  const [adsets, campaigns, ads] = await Promise.all([
    metaAll(acct.token, `/${acct.id}/adsets`, { fields: 'id,daily_budget,effective_status', limit: '500' }, 6),
    metaAll(acct.token, `/${acct.id}/campaigns`, { fields: 'id,daily_budget', limit: '500' }, 6),
    metaAll(acct.token, `/${acct.id}/ads`, { fields: 'id,effective_status', limit: '500' }, 12),
  ])
  const toDollars = (v: any) => (v != null ? num(v) / 100 : 0)
  const byAdset: Record<string, number> = {}
  const byCampaign: Record<string, number> = {}
  const adStatus: Record<string, string> = {}
  const adsetStatus: Record<string, string> = {}
  for (const a of adsets.data) {
    if (a.daily_budget) byAdset[a.id] = toDollars(a.daily_budget)
    if (a.effective_status) adsetStatus[a.id] = String(a.effective_status)
  }
  for (const c of campaigns.data) if (c.daily_budget) byCampaign[c.id] = toDollars(c.daily_budget)
  for (const a of ads.data) if (a.effective_status) adStatus[a.id] = String(a.effective_status)
  return { byAdset, byCampaign, adStatus, adsetStatus }
}

/** Ask Meta. One call per account, the window ending today. */
async function fetchLive(days: number) {
  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))

  const accounts = adAccounts()
  if (accounts.length === 0) {
    return { creatives: [], accounts: [], outcomes: false, error: 'No Meta ad account is configured.' }
  }

  const perAccount = await Promise.all(
    accounts.map(async (acct) => {
      const [insights, budgets] = await Promise.all([
        metaAll(acct.token, `/${acct.id}/insights`, {
          fields: FIELDS,
          level: 'ad',
          time_increment: '1',
          time_range: JSON.stringify({ since: isoDay(since), until: isoDay(until) }),
          limit: '1000',
        }),
        budgetsFor(acct),
      ])

      /* Group the per-day rows under their ad. Meta emits one row per ad per
         day it delivered — days with no delivery are simply absent, which is
         exactly what the center's date filters expect. */
      const byAd = new Map<string, any[]>()
      for (const r of insights.data) {
        if (!r.ad_id) continue
        const list = byAd.get(r.ad_id)
        if (list) list.push(r)
        else byAd.set(r.ad_id, [r])
      }

      const creatives = [...byAd.entries()].map(([adId, rows]) => {
        rows.sort((a, b) => (a.date_start < b.date_start ? -1 : 1))
        const head = rows[rows.length - 1]
        const name: string = head.ad_name ?? ''

        const daily = rows.map((r) => {
          const hooks = actionVal(r.actions, 'video_view') || actionVal(r.video_play_actions, 'video_view')
          return {
            date: r.date_start,
            spend: num(r.spend),
            impressions: num(r.impressions),
            hooks,
            linkClicks: r.inline_link_clicks != null ? num(r.inline_link_clicks) : actionVal(r.actions, 'link_click'),
            leads: leadsOf(r.actions),
            /* Signed cases are a pipeline outcome, dated by the stage change
               that signed them — Meta cannot answer it. The client fills this
               in from the GHL sweep; 0 here means "not loaded yet", which is
               why the response reports outcomes: false. */
            acquisitions: 0,
          }
        })

        const parsed = parseAdName(name)
        const anyVideo = daily.some((d) => d.hooks > 0)

        return {
          id: adId,
          adId,
          name,
          // The ad name IS the naming convention in this account.
          convention: name,
          campaign: head.campaign_name ?? '—',
          adset: head.adset_name ?? '—',
          /* The id, not just the name: the watch list groups on the ad set, and
             two accounts can carry ad sets of the same name. */
          adsetId: head.adset_id,
          angle: parsed.angle ?? 'Unassigned',
          /* The firm the ad runs for, read off its name. Campaign names carry
             the same code, and the two agree across all 171 live ads — the ad
             name is used because it is the field the convention guarantees. */
          firm: firmOf(name),
          format: anyVideo ? 'Video' : 'Image',
          /* First day the ad actually delivered inside the window. Meta's
             created_time would need a per-ad hop for a number that only feeds
             NEW-vs-ACTIVE staging, and anything first delivering before the
             window opened is ACTIVE either way. */
          launchDate: rows[0].date_start,
          dailyBudget: budgets.byAdset[head.adset_id] ?? budgets.byCampaign[head.campaign_id] ?? 0,
          daily,
          account: acct.key,
          accountLabel: acct.label,
          /* Meta's own answer to "is this switched on". Undefined if the ad
             was not in the status sweep, which the UI treats as unknown
             rather than as off. */
          status: budgets.adStatus[adId],
          adsetStatus: budgets.adsetStatus[head.adset_id],
        }
      })

      return { acct, creatives, error: insights.error, truncated: insights.truncated }
    }),
  )

  const creatives = perAccount
    .flatMap((p) => p.creatives)
    .sort((a, b) => {
      const s = (c: typeof a) => c.daily.reduce((t, d) => t + d.spend, 0)
      return s(b) - s(a)
    })

  // One account failing must not blank the other, and "Meta error" with two
  // configured leaves nobody knowing which half of the page is missing.
  const failures = perAccount.filter((p) => p.error).map((p) => `${p.acct.label}: ${p.error}`)

  return {
    creatives,
    accounts: perAccount.map((p) => ({
      key: p.acct.key,
      label: p.acct.label,
      creatives: p.creatives.length,
      error: p.error,
      truncated: p.truncated,
    })),
    window: { since: isoDay(since), until: isoDay(until), days },
    /* Pipeline outcomes are loaded separately by the client, from the GHL
       sweep — until they arrive the UI must not read 0 as fact. */
    outcomes: false,
    error: failures.length ? failures.join(' · ') : null,
  }
}

/* ───────────────────────────── the day lock ─────────────────────────────

   Meta's numbers move all day. The center's decisions do not: a kill is
   dated, a watch row is dated, a launch is dated. Reading live Meta under a
   dated board meant stepping the day nav back showed last Tuesday's kill
   list against this morning's CPLs — the one combination nobody can reason
   from, because it is not what the room was looking at when it decided.

   So the numbers are written down once per Pacific day and that copy is
   what the whole center reads for the rest of it. Past days are served from
   their copy and never rewritten. Today's can be re-taken on demand, which
   is the only write that replaces a row.

   The table is optional. Without it the route behaves exactly as it did
   before — live Meta, nothing frozen — and says so in `locked: false`, so
   the center keeps working before the migration is run. */

const SNAPSHOT_TABLE = 'creative_day_snapshot'

/** The Pacific day, which is the day the whole center works to. */
function pacificDay(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}

/** A missing table must read as "no snapshot", not as an outage. */
const noTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message ?? ''))

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const days = Math.min(Math.max(parseInt(sp.get('days') || '30', 10) || 30, 7), 90)
  const today = pacificDay()
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('day') || '') ? sp.get('day')! : today
  const isToday = day === today
  /* Only a day that is over is a record. Tomorrow is not — Launch Lists
     queues ads for it, and a day you cannot write to is no use for that —
     so a forward date reads today's live numbers and stays open. */
  const isPast = day < today
  const isFuture = day > today
  // Re-taking the numbers is a thing you can only do to today. A past day is
  // a record; a record you can overwrite is not one.
  const refresh = sp.get('refresh') === '1' && isToday

  const supa = db()
  /* Whether the day lock is actually switched on — the table is added by
     hand, and until it is, every day shows live Meta. The client has to be
     able to tell that apart from a day that was simply never written down,
     or the banner claims a past day is frozen when it is showing today's
     figures. */
  let lockAvailable = !!supa

  if (supa && !isFuture && !refresh) {
    const { data, error } = await supa
      .from(SNAPSHOT_TABLE)
      .select('day, payload, ad_count, taken_at')
      .eq('day', day)
      .maybeSingle()

    if (noTable(error)) lockAvailable = false

    if (data?.payload) {
      return NextResponse.json({
        ...(data.payload as object),
        day,
        locked: isPast,
        lockAvailable: true,
        snapshot: { day: data.day, takenAt: data.taken_at, ads: data.ad_count },
      })
    }
    /* A past day with nothing written down cannot be reconstructed — Meta
       will only ever answer with the series as it stands now. Say so rather
       than quietly showing today's numbers under yesterday's date. */
    if (isPast && !noTable(error)) {
      return NextResponse.json({
        creatives: [], accounts: [], outcomes: false, error: null,
        day, locked: true, lockAvailable: true, snapshot: null, missing: true,
      })
    }
  }

  const payload = await fetchLive(days)

  // Only a good read gets written down: a day frozen on a Meta outage would
  // keep that outage forever.
  if (supa && isToday && !payload.error && payload.creatives.length > 0) {
    const { error } = await supa.from(SNAPSHOT_TABLE).upsert({
      day,
      payload,
      ad_count: payload.creatives.length,
      taken_at: new Date().toISOString(),
    }, { onConflict: 'day' })
    if (noTable(error)) lockAvailable = false
    else if (error) console.error('[creatives] snapshot write failed', error.message)
    if (!error) {
      return NextResponse.json({
        ...payload, day, locked: false, lockAvailable: true,
        snapshot: { day, takenAt: new Date().toISOString(), ads: payload.creatives.length },
      })
    }
  }

  return NextResponse.json({ ...payload, day, locked: isPast, lockAvailable, snapshot: null })
}
