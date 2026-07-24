import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/dialer/leads-db?search=&limit=50&offset=0
// Returns leads from dialer_calls (real call history) + counts
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const search = searchParams.get('search') ?? ''
  const limit  = parseInt(searchParams.get('limit')  ?? '50', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0',  10)

  const db = supabaseAdmin()

  // Get distinct contacts from dialer_calls, latest call per contact
  let query = db
    .from('dialer_calls')
    .select('contact_id, contact_name, phone, firm, stage_name, campaign_id, call_status, disposition, duration, started_at, ended_at, call_sid', { count: 'exact' })
    .not('contact_id', 'is', null)
    .order('started_at', { ascending: false })

  if (search) {
    query = query.or(`contact_name.ilike.%${search}%,phone.ilike.%${search}%`)
  }

  const { data: calls, count, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    console.error('[leads-db] error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Deduplicate by contact_id — keep most recent call per contact
  const seen = new Set<string>()
  const leads: typeof calls = []
  for (const row of (calls ?? [])) {
    if (!row.contact_id || seen.has(row.contact_id)) continue
    seen.add(row.contact_id)
    leads.push(row)
  }

  return NextResponse.json({ leads, total: count ?? 0 })
}
