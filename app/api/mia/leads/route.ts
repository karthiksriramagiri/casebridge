import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   Signed cases, for putting on the MIA board.

   The board used to be filled by typing a name in, which is how you get
   "Jon Porter" on the board and "John Porter" in the pipeline and nobody
   able to tell they are the same person. This searches the real signed
   cases instead, so a card carries the lead's own id, phone and firm from
   the moment it is created.

   A signed case is a `ghl_leads` row with no pipeline stage — the stage
   column tracks a lead's progress and is cleared once the case signs. Same
   definition Finance invoices against and the Creative Center counts, so
   the three cannot drift.

   Admin only, like adding to the board itself: this returns every client's
   name and phone number, which is not something a rep needs from a search
   box they were not going to be allowed to act on.
   ═══════════════════════════════════════════════════════════════════════════ */

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()

  let query = admin
    .from('ghl_leads')
    .select('id, contact_name, contact_phone, contact_id, firm_id, invoice_code, qualified_at, closer, closed_by_profile_id, case_status')
    .is('pipeline_stage', null)
    /* A replaced case has already been swapped out — chasing the person is
       no longer the job, so it is not offered. */
    .neq('case_status', 'replacement')
    .order('qualified_at', { ascending: false, nullsFirst: false })
    .limit(q ? 40 : 25)

  if (q) {
    /* Name or phone. A rep searching from a callback sheet has the number
       and not the spelling, which is exactly the case typing-it-in got
       wrong. */
    const safe = q.replace(/[%,()]/g, ' ').trim()
    query = query.or(`contact_name.ilike.%${safe}%,contact_phone.ilike.%${safe}%`)
  }

  const [leads, firms, onBoard] = await Promise.all([
    query,
    admin.from('firms').select('id, name'),
    /* Already on the board. Shown as such rather than hidden: a name that
       silently fails to appear in a search reads as the search being
       broken, and "already on the board" is the answer the admin needs. */
    admin.from('mia_cases').select('lead_id, status'),
  ])

  if (leads.error) {
    return NextResponse.json({ leads: [], error: leads.error.message }, { status: 500 })
  }

  const firmById = new Map((firms.data ?? []).map((f) => [f.id, f.name as string]))
  const placed = new Map<string, string>()
  for (const r of onBoard.data ?? []) if (r.lead_id) placed.set(String(r.lead_id), String(r.status))

  return NextResponse.json({
    leads: (leads.data ?? []).map((r) => ({
      id: String(r.id),
      name: r.contact_name ?? '(no name)',
      phone: r.contact_phone ?? null,
      firmId: r.firm_id ?? null,
      firmName: r.firm_id ? firmById.get(r.firm_id) ?? null : null,
      invoiceCode: r.invoice_code ?? null,
      /* The closer, in both forms. Preferring the id and falling back to the
         text is how the rest of the app reads this field — a case closed
         before the Team Center existed has only the name. */
      closer: r.closer ?? null,
      closerId: r.closed_by_profile_id ?? null,
      signedOn: String(r.qualified_at ?? '').slice(0, 10),
      /* Which column it is already in, if any. */
      onBoard: placed.get(String(r.id)) ?? null,
    })),
    error: null,
  })
}
