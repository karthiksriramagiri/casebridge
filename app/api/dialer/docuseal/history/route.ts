import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/dialer/docuseal/history
// Returns all DocuSeal submissions, most recent first
export async function GET() {
  const db = supabaseAdmin()

  const { data, error } = await db
    .from('dialer_docuseal_submissions')
    .select('id, submission_id, template_name, contact_name, phone, firm, date_of_loss, city_of_accident, passenger_count, sent_by, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ submissions: data ?? [] })
}
