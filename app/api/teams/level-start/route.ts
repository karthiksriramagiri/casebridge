import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { advanceOnly } from '@/app/teams/admin/candidates/stages'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { level } = await req.json()
  if (level !== 2) return NextResponse.json({ error: 'Invalid level' }, { status: 400 })

  // Only set if not already started
  const { data: profile } = await supabase
    .from('profiles')
    .select('level2_started_at, candidate_stage')
    .eq('id', user.id)
    .single()

  if (profile?.level2_started_at) {
    return NextResponse.json({ success: true, alreadyStarted: true })
  }

  /* Starting module 2 is the signal that the call happened, so it also moves
     the rep to Nuance Book on the onboarding board — forward only, so an
     admin who has already advanced them keeps their placement. */
  const update: Record<string, any> = { level2_started_at: new Date().toISOString() }
  const nextStage = advanceOnly(profile?.candidate_stage, 'nuance_book')
  if (nextStage) update.candidate_stage = nextStage

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id)

  if (error) {
    /* The board column may not exist yet. Losing the stage move is survivable;
       losing the level-2 timestamp would strand the rep mid-training. */
    if (/candidate_stage|schema cache/i.test(error.message)) {
      const { error: retry } = await supabase.from('profiles')
        .update({ level2_started_at: update.level2_started_at }).eq('id', user.id)
      if (retry) return NextResponse.json({ error: retry.message }, { status: 500 })
      return NextResponse.json({ success: true, boardNotMigrated: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
