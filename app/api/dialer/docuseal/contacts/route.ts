import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/dialer/docuseal/contacts?q=search_term
// Searches dialer_calls for contacts matching name or phone
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  if (!q || q.length < 2) {
    return NextResponse.json({ contacts: [] })
  }

  const db = supabaseAdmin()

  // Search by name (ilike) or phone (contains)
  const isPhone = /^\+?\d/.test(q)

  let query = db
    .from('dialer_calls')
    .select('contact_id, contact_name, phone, firm')
    .not('contact_id', 'is', null)
    .not('contact_id', 'eq', '')
    .order('started_at', { ascending: false })
    .limit(200)

  if (isPhone) {
    query = query.ilike('phone', `%${q}%`)
  } else {
    query = query.ilike('contact_name', `%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Deduplicate by contact_id, keep most recent
  const seen = new Map<string, any>()
  for (const row of data ?? []) {
    if (!row.contact_id || seen.has(row.contact_id)) continue
    seen.set(row.contact_id, {
      contactId: row.contact_id,
      name: row.contact_name ?? '',
      phone: row.phone ?? '',
      firm: row.firm ?? '',
    })
  }

  return NextResponse.json({ contacts: Array.from(seen.values()).slice(0, 50) })
}
