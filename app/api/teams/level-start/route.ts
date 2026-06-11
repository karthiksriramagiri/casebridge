import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { level } = await req.json()
  if (level !== 2) return NextResponse.json({ error: 'Invalid level' }, { status: 400 })

  // Only set if not already started
  const { data: profile } = await supabase
    .from('profiles')
    .select('level2_started_at')
    .eq('id', user.id)
    .single()

  if (profile?.level2_started_at) {
    return NextResponse.json({ success: true, alreadyStarted: true })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ level2_started_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
