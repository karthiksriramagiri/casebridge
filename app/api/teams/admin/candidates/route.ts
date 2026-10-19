import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FIRST_STAGE, STAGE_KEYS } from '@/app/teams/admin/candidates/stages'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

/* The board reads every intake rep, not a separate candidate table: the people
   on it already have logins, so a second record would only drift from the one
   that matters. The stage column is read with a fallback because the board has
   to render before the migration is run — a missing column shows everyone in
   the first stage rather than an error card. */

const NO_COLUMN = /candidate_stage|candidate_position|column .* does not exist|schema cache/i

export async function GET() {
  const base = 'id, name, role, team_type, shift, created_at, level2_started_at, hide_from_hr'
  let rows: any[] | null = null
  let needsMigration = false

  const full = await supabase.from('profiles')
    .select(`${base}, candidate_stage, candidate_position`)
    .eq('role', 'rep')
    .order('created_at', { ascending: true })

  if (full.error && NO_COLUMN.test(full.error.message)) {
    needsMigration = true
    const fallback = await supabase.from('profiles').select(base)
      .eq('role', 'rep').order('created_at', { ascending: true })
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    rows = fallback.data
  } else if (full.error) {
    return NextResponse.json({ error: full.error.message }, { status: 500 })
  } else {
    rows = full.data
  }

  const reps = (rows ?? []).filter(r => !r.hide_from_hr)

  /* Who has booked their call. Shown on the card so an admin can see the
     signal behind an automatic move, and used to place anyone whose booking
     landed before this board existed. */
  const ids = reps.map(r => r.id)
  let booked = new Map<string, string>()
  if (ids.length) {
    const { data } = await supabase.from('bookings')
      .select('user_id, slot_time').in('user_id', ids)
    for (const b of data ?? []) {
      const cur = booked.get(b.user_id)
      if (!cur || b.slot_time < cur) booked.set(b.user_id, b.slot_time)
    }
  }

  const candidates = reps.map(r => {
    const stored = STAGE_KEYS.includes(r.candidate_stage) ? r.candidate_stage : null
    /* No stored stage yet: place them from the signals rather than dumping
       every existing rep in the first column. Module 2 outranks a booking
       because it happens later. */
    const derived = r.level2_started_at ? 'nuance_book'
                  : booked.has(r.id)    ? 'booked_call'
                  : FIRST_STAGE
    return {
      id: r.id,
      name: r.name || 'Unnamed',
      team: r.team_type || '',
      shift: r.shift || '',
      createdAt: r.created_at,
      stage: stored ?? derived,
      position: r.candidate_position ?? null,
      bookedAt: booked.get(r.id) ?? null,
      level2At: r.level2_started_at ?? null,
      placed: Boolean(stored),
    }
  })

  return NextResponse.json({ candidates, needsMigration })
}

// PATCH — move a card. Body: { id, stage, position? }
export async function PATCH(req: NextRequest) {
  const { id, stage, position } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (!STAGE_KEYS.includes(stage)) {
    return NextResponse.json({ error: `stage must be one of ${STAGE_KEYS.join(', ')}` }, { status: 400 })
  }

  const patch: Record<string, any> = { candidate_stage: stage }
  /* candidate_position is an integer column. A caller sending a millisecond
     epoch — which is what "append to the end" reaches for — overflows it and
     Postgres rejects the whole update, so the stage move is lost along with
     the position. Clamp rather than fail: the ordering within a column is
     cosmetic, where the card sits is not. */
  if (typeof position === 'number' && Number.isFinite(position)) {
    patch.candidate_position = Math.max(0, Math.min(Math.round(position), 2_147_483_647))
  }

  const { data, error } = await supabase.from('profiles')
    .update(patch).eq('id', id).select('id, candidate_stage').single()

  if (error) {
    if (NO_COLUMN.test(error.message)) {
      return NextResponse.json(
        { error: 'Run supabase/migration_candidate_board.sql to save moves.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, candidate: data })
}
