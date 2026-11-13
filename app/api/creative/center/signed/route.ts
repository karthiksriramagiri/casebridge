import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { creativeDayOf } from '@/lib/creative-day'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   Signed cases per creative — the Financial Center's own numbers.

   This reads exactly what /api/finance/pcs reads: a signed case is a
   `ghl_leads` row with no pipeline stage, because the stage column tracks a
   lead's progress and is cleared once the case signs. So the Creative Center
   now counts the same cases Finance invoices and pays commission on, rather
   than a second opinion that drifts from it.

   The grain is the point. A driver and their passenger are signed under one
   GHL contact but are two cases, and the pipeline's opportunity search can
   only ever see the contact — it counts them once. Across the book that is
   540 cases read as 474, a 14% undercount, concentrated in exactly the ads
   that produce multi-claimant accidents. Every one of those rows is here.

   Replacements are flagged, not dropped, the same way the invoice page shows
   them: they are real cases that were swapped, and a list that hides them
   never reconciles with the invoice. The Creative Center counts originals
   for CPA and keeps the replacement visible beside them.
   ═══════════════════════════════════════════════════════════════════════════ */

type Case = {
  name: string
  date: string
  stage: string
  phone: string | null
  closer: string | null
  invoiceCode: string | null
  firmName: string | null
  isReplacement: boolean
}

/* The center's own day, 2am to 2am Pacific — see lib/creative-day.

   These keys are joined against the center's daily rows, so they have to
   turn over at the same moment it does or a case lands on a day the page
   has no column for.

   Two consequences worth stating. Finance counts its day in Eastern, so a
   case signed between the center's rollover and midnight Eastern is
   yesterday's here and today's there; the center is right about its own
   calendar and the two will not agree for those hours. And Meta buckets its
   spend at midnight in the ad account's timezone, which nothing here
   controls — so a case signed between midnight and 2am is filed on the
   previous working day while the click that bought it sits on the next
   day's spend. Rare, since the intake desk works evenings, and the
   alternative is worse: a case landing on a day the board has not opened. */
const day = (iso: string | null | undefined) => creativeDayOf(iso)

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ byAdId: {}, byAdName: {}, error: 'Supabase is not configured.' }, { status: 200 })
  }

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '120', 10) || 120, 7), 400)
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  since.setHours(0, 0, 0, 0)

  const db = createClient(url, key)
  const [cases, firms] = await Promise.all([
    db.from('ghl_leads')
      .select('id, contact_name, contact_phone, firm_id, invoice_code, case_status, qualified_at, closer, ad_id, ad_name, created_at')
      .is('pipeline_stage', null)
      .gte('qualified_at', since.toISOString())
      .order('qualified_at', { ascending: false, nullsFirst: false })
      .limit(5000),
    db.from('firms').select('id, name'),
  ])

  if (cases.error) {
    return NextResponse.json({ byAdId: {}, byAdName: {}, error: cases.error.message }, { status: 200 })
  }

  const firmName = new Map((firms.data ?? []).map(f => [f.id, f.name]))

  /* Two indexes, because attribution is uneven: every case carries an ad id
     where one was captured, but only some carry the ad's name. The center
     joins on the id and falls back to the name, so a case is attached to its
     creative whichever of the two GHL managed to record. */
  const byAdId: Record<string, Case[]> = {}
  const byAdName: Record<string, Case[]> = {}

  for (const r of cases.data ?? []) {
    const isReplacement = String(r.case_status || '').toLowerCase() === 'replacement'
    const row: Case = {
      name: (r.contact_name || '(no name)').replace(/\s+/g, ' ').trim(),
      date: day(r.qualified_at || r.created_at),
      stage: isReplacement ? 'Replacement' : 'Signed',
      phone: r.contact_phone || null,
      closer: r.closer || null,
      invoiceCode: r.invoice_code || null,
      firmName: firmName.get(r.firm_id) ?? null,
      isReplacement,
    }

    /* An unresolved merge field ("{{ ... }}") is a template that never filled,
       not an ad id. */
    const adId = String(r.ad_id ?? '')
    const hasId = !!adId && !adId.includes('{{')
    if (hasId) (byAdId[adId] ??= []).push(row)

    /* Only the cases with no id of their own. A case that carries both
       used to be filed under each, and the center takes the id index when
       it has one and the name index when it does not — so the same case
       was counted twice the moment a second live ad carried the same name,
       which happens every time a cut is re-uploaded. The ad id the case
       was captured against is the authority; the name is the fallback for
       cases GHL never recorded one for. */
    const adName = String(r.ad_name ?? '').trim()
    if (!hasId && adName && !adName.includes('{{')) (byAdName[adName] ??= []).push(row)
  }

  return NextResponse.json({
    byAdId,
    byAdName,
    total: (cases.data ?? []).length,
    since: day(since.toISOString()),
    error: null,
  })
}
