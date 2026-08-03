import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/dialer/contacts/search?q=<name or phone>
// Searches our own dialer data for contacts by name or phone
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (!q) return NextResponse.json({ contacts: [] })

  const db = supabaseAdmin()

  // Search dialer_calls for matching contacts (has the most complete data)
  const isPhoneSearch = /^\+?\d/.test(q.trim())

  let query = db
    .from('dialer_calls')
    .select('contact_id, contact_name, phone, firm')
    .not('contact_id', 'is', null)
    .not('phone', 'is', null)

  if (isPhoneSearch) {
    query = query.ilike('phone', `%${q.trim()}%`)
  } else {
    query = query.ilike('contact_name', `%${q.trim()}%`)
  }

  const { data: rows } = await query
    .order('started_at', { ascending: false })
    .limit(100)

  // Dedupe by contact_id, keep most recent
  const seen = new Map<string, { id: string; name: string; phone: string; firm: string | null }>()
  for (const row of rows ?? []) {
    if (!row.contact_id || seen.has(row.contact_id)) continue
    seen.set(row.contact_id, {
      id:    row.contact_id,
      name:  row.contact_name ?? '',
      phone: row.phone,
      firm:  row.firm ?? null,
    })
  }

  const contacts = Array.from(seen.values()).slice(0, 20)

  return NextResponse.json({ contacts })
}
