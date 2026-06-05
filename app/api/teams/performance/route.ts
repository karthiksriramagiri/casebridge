import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: scores } = await admin
    .from('rep_performance')
    .select('id, date, score, notes')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  const list = scores || []
  const avg = list.length > 0
    ? list.reduce((sum, s) => sum + Number(s.score), 0) / list.length
    : null

  return NextResponse.json({ scores: list, average: avg ? Number(avg.toFixed(2)) : null })
}
