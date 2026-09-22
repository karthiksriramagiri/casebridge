import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  NO_STATE_FILTER, passesStateFilter, fillAllReadyReps, todayEastern,
  type StateFilter,
} from '@/app/dialer/_lib/queue-engine'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const MODES = ['off', 'include', 'exclude'] as const

// GET /api/dialer/queue/state-filter
// → { mode, states, updated_at, updated_by }
export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('dialer_queue_settings')
    .select('state_filter_mode, state_filter_list, updated_at, updated_by')
    .eq('id', 1)
    .maybeSingle()

  // Table missing (migration not run yet) → report "no filter" rather than 500
  if (error || !data) return NextResponse.json({ ...NO_STATE_FILTER, updated_at: null, updated_by: null })

  return NextResponse.json({
    mode:       data.state_filter_mode ?? 'off',
    states:     data.state_filter_list ?? [],
    updated_at: data.updated_at,
    updated_by: data.updated_by,
  })
}

// PUT /api/dialer/queue/state-filter
// Body: { mode: 'off'|'include'|'exclude', states: string[], updatedBy?: string }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const mode = body.mode

  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: `mode must be one of ${MODES.join(', ')}` }, { status: 400 })
  }

  const states: string[] = Array.from(new Set<string>(
    (Array.isArray(body.states) ? body.states : [])
      .map((s: unknown) => String(s).trim().toUpperCase())
      .filter((s: string) => /^[A-Z]{2}$/.test(s))
  )).sort()

  if (mode !== 'off' && states.length === 0) {
    return NextResponse.json({ error: 'pick at least one state, or set mode to off' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data, error } = await db.from('dialer_queue_settings')
    .upsert({
      id:                1,
      state_filter_mode: mode,
      state_filter_list: mode === 'off' ? [] : states,
      updated_at:        new Date().toISOString(),
      updated_by:        body.updatedBy ?? null,
    }, { onConflict: 'id' })
    .select('state_filter_mode, state_filter_list, updated_at, updated_by')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Apply it now: pull already-buffered leads that no longer qualify back into
  // the pending pool, then top the reps back up. Leased leads (rep is on the
  // call) and callbacks are left alone.
  const filter: StateFilter = { mode, states: mode === 'off' ? [] : states }
  const released = await releaseFilteredBuffers(db, filter)
  await fillAllReadyReps(5).catch(console.error)

  return NextResponse.json({
    released,
    mode:       data.state_filter_mode,
    states:     data.state_filter_list,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
  })
}

// Un-buffer today's queued leads that the new filter rejects.
async function releaseFilteredBuffers(
  db: ReturnType<typeof supabaseAdmin>,
  filter: StateFilter,
): Promise<number> {
  if (filter.mode === 'off') return 0

  const { data } = await db.from('dialer_attempts')
    .select('id, phone, is_callback')
    .eq('plan_date', todayEastern())
    .eq('status', 'buffered')

  const ids = (data ?? [])
    .filter(a => !a.is_callback && !passesStateFilter(a.phone, filter))
    .map(a => a.id)
  if (ids.length === 0) return 0

  await db.from('dialer_attempts')
    .update({
      status:       'pending',
      buffered_for: null,
      buffered_at:  null,
      updated_at:   new Date().toISOString(),
    })
    .in('id', ids)
    .eq('status', 'buffered')

  return ids.length
}
