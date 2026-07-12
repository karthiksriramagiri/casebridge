import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const admin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: repId } = await params

  const { data: notes, error } = await admin
    .from('call_listen_notes')
    .select('id, case_id, notes, updated_at')
    .eq('user_id', repId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch case names from ghl_leads
  const caseIds = (notes || []).map(n => n.case_id)
  let caseNames: Record<string, string> = {}
  if (caseIds.length > 0) {
    const { data: leads } = await admin
      .from('ghl_leads')
      .select('id, contact_name, qualified_at')
      .in('id', caseIds)
    for (const l of leads || []) {
      caseNames[l.id] = l.contact_name || 'Unknown'
    }
  }

  const result = (notes || []).map(n => ({
    id: n.id,
    caseId: n.case_id,
    contactName: caseNames[n.case_id] || 'Unknown',
    notes: n.notes,
    updatedAt: n.updated_at,
  }))

  return NextResponse.json({ notes: result })
}
