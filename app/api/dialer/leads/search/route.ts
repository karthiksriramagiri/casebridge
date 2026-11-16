import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   Finding one lead, anywhere.

   Both search boxes in the dialer were scoped to a stage: pick a pipeline
   stage first, then filter inside it. That answers "who is in this stage"
   and not "where is this person", which is the question actually asked —
   a rep with a name in front of them does not know which stage it sits in,
   and checking eight stages to find out is the thing they were doing
   instead of calling.

   So this searches every lead, by name, phone or email, and hands back
   enough to dial without a second request: the number, the firm, the stage
   it is sitting in, and whether it has already signed.

   Two sources, in order:

     ghl_leads      every lead the business has, whether or not anyone has
                    ever called it. This is what makes the search complete.
     dialer_calls   the fallback for a contact that was called but never
                    landed in ghl_leads — rare, and invisible otherwise.

   Phone digits are matched loose. A rep reading a number off a note types
   `5551234` or `(555) 123-4567`; both have to find the same person, so the
   query strips everything that is not a digit from the needle and matches
   on the tail.
   ═══════════════════════════════════════════════════════════════════════════ */

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export type LeadHit = {
  contactId: string
  name: string
  phone: string
  email: string | null
  firm: string | null
  firmId: string | null
  stageName: string | null
  /* A lead with no pipeline stage has signed — the stage column tracks
     progress and is cleared when the case closes. Worth saying on the row,
     because calling a signed case is usually a mistake. */
  signed: boolean
  lastCalledAt: string | null
}

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 25, 50)
  /* Two characters finds half the database and helps nobody. */
  if (raw.length < 2) return NextResponse.json({ leads: [] })

  const supabase = db()
  const digits = raw.replace(/\D/g, '')
  /* Seven digits is a local number — matching on the tail finds it whether
     the stored value carries a country code or not. */
  const phoneNeedle = digits.length >= 7 ? digits.slice(-7) : digits.length >= 4 ? digits : ''

  const [leadsRes, firmsRes] = await Promise.all([
    (() => {
      let q = supabase
        .from('ghl_leads')
        .select('contact_id, contact_name, contact_phone, contact_email, firm_id, pipeline_stage, qualified_at, created_at')
        .not('contact_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit * 4)
      /* A query that looks like a number searches the number; anything
         else searches the words. Searching both for every keystroke makes
         "Jo" match a phone containing 'jo', which it cannot. */
      return phoneNeedle
        ? q.ilike('contact_phone', `%${phoneNeedle}%`)
        : q.or(`contact_name.ilike.%${raw}%,contact_email.ilike.%${raw}%`)
    })(),
    supabase.from('firms').select('id, name, slug'),
  ])

  if (leadsRes.error) {
    return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })
  }

  const firmName = new Map((firmsRes.data ?? []).map((f: any) => [f.id, f.slug || f.name]))

  /* One row per person. The same contact appears once per lead record, and
     a rep searching for a name wants the person, not their history. */
  const seen = new Map<string, LeadHit>()
  for (const r of leadsRes.data ?? []) {
    if (!r.contact_id || seen.has(r.contact_id)) continue
    if (!r.contact_phone) continue
    seen.set(r.contact_id, {
      contactId: r.contact_id,
      name: r.contact_name || '(no name)',
      phone: r.contact_phone,
      email: r.contact_email ?? null,
      firm: r.firm_id ? firmName.get(r.firm_id) ?? null : null,
      firmId: r.firm_id ?? null,
      stageName: r.pipeline_stage ?? null,
      signed: !r.pipeline_stage && Boolean(r.qualified_at),
      lastCalledAt: null,
    })
  }

  /* Anyone called but not in ghl_leads. Only worth asking when the first
     source came up short. */
  if (seen.size < limit) {
    let q = supabase
      .from('dialer_calls')
      .select('contact_id, contact_name, phone, firm, started_at')
      .not('contact_id', 'is', null)
      .not('phone', 'is', null)
      .order('started_at', { ascending: false })
      .limit(100)
    q = phoneNeedle ? q.ilike('phone', `%${phoneNeedle}%`) : q.ilike('contact_name', `%${raw}%`)
    const { data: calls } = await q
    for (const c of calls ?? []) {
      if (!c.contact_id || seen.has(c.contact_id)) continue
      seen.set(c.contact_id, {
        contactId: c.contact_id,
        name: c.contact_name || '(no name)',
        phone: c.phone,
        email: null,
        firm: c.firm ?? null,
        firmId: null,
        stageName: null,
        signed: false,
        lastCalledAt: c.started_at ?? null,
      })
      if (seen.size >= limit) break
    }
  }

  return NextResponse.json({ leads: [...seen.values()].slice(0, limit) })
}
