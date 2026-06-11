import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { caseId, notes } = await request.json()
  if (!caseId || typeof notes !== 'string') {
    return NextResponse.json({ error: 'caseId and notes required' }, { status: 400 })
  }

  const { error } = await admin
    .from('call_listen_notes')
    .upsert(
      { user_id: user.id, case_id: caseId, notes: notes.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,case_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
