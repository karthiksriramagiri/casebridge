import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/teams/retake-notifications — rep's unacknowledged retake requests
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await admin
    .from('retake_notifications')
    .select('id, module_id, module_title, message, created_at')
    .eq('user_id', user.id)
    .eq('acknowledged', false)
    .order('created_at', { ascending: true })

  return NextResponse.json({ notifications: data || [] })
}

// POST /api/teams/retake-notifications — acknowledge one or all
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json() // array of notification IDs to acknowledge

  const { error } = await admin
    .from('retake_notifications')
    .update({ acknowledged: true })
    .eq('user_id', user.id)
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
