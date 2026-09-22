import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

/* The assignee list for the board. Creative reps already carry
   team_type='creative' and a creative_slug (migration_creative_slug.sql),
   which is the same slug the signed-case Slack alert matches on — so the
   person a brief is assigned to is the person who gets credited when the ad
   they made signs a case. */
export async function GET() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, creative_slug')
    .eq('team_type', 'creative')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ reps: [] })
  return NextResponse.json({ reps: data || [] })
}
