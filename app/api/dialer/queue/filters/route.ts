import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  passesStateFilter, passesFirmFilter, fillAllReadyReps, todayEastern,
  type StateFilter, type FirmFilter,
} from '@/app/dialer/_lib/queue-engine'

/* ═══════════════════════════════════════════════════════════════════════════
   Which leads the floor is allowed to dial.

   Two independent gates on one settings row: state (from the lead's area
   code) and firm (from the attempt). A lead has to pass both. They are served
   and saved together because they are one decision in the admin's head —
   "who are we calling today" — even though they filter on different things.

   Changing either takes effect on the next buffer fill. Leads already queued
   but no longer allowed are pulled back here rather than left sitting in a
   rep's buffer until they happen to be dialled.
   ═══════════════════════════════════════════════════════════════════════════ */

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const MODES = ['off', 'include', 'exclude'] as const
type Mode = typeof MODES[number]

const OFF = { mode: 'off' as Mode, states: [] as string[] }

export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('dialer_queue_settings')
    .select('state_filter_mode, state_filter_list, firm_filter_mode, firm_filter_list, updated_at, updated_by')
    .eq('id', 1)
    .maybeSingle()

  // Table or columns missing (migration not run) → report "no filter" rather
  // than 500, so the page renders its controls in the off position.
  if (error || !data) {
    return NextResponse.json({
      state: { mode: 'off', states: [] },
      firm:  { mode: 'off', firms: [] },
      needsMigration: !!error,
      updated_at: null, updated_by: null,
    })
  }

  return NextResponse.json({
    state: { mode: data.state_filter_mode ?? 'off', states: data.state_filter_list ?? [] },
    firm:  { mode: data.firm_filter_mode  ?? 'off', firms:  data.firm_filter_list  ?? [] },
    needsMigration: data.firm_filter_mode === undefined,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
  })
}

/** PUT { state?: { mode, states }, firm?: { mode, firms } } — either or both. */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {
    id: 1,
    updated_at: new Date().toISOString(),
    updated_by: body.updatedBy ?? null,
  }

  let stateFilter: StateFilter | null = null
  let firmFilter: FirmFilter | null = null

  if (body.state) {
    const mode = body.state.mode as Mode
    if (!MODES.includes(mode)) {
      return NextResponse.json({ error: `state.mode must be one of ${MODES.join(', ')}` }, { status: 400 })
    }
    const states: string[] = Array.from(new Set<string>(
      (Array.isArray(body.state.states) ? body.state.states : [])
        .map((s: unknown) => String(s).trim().toUpperCase())
        .filter((s: string) => /^[A-Z]{2}$/.test(s))
    )).sort()
    if (mode !== 'off' && states.length === 0) {
      return NextResponse.json({ error: 'Pick at least one state, or set the state filter to off.' }, { status: 400 })
    }
    patch.state_filter_mode = mode
    patch.state_filter_list = mode === 'off' ? [] : states
    stateFilter = { mode, states: mode === 'off' ? [] : states }
  }

  if (body.firm) {
    const mode = body.firm.mode as Mode
    if (!MODES.includes(mode)) {
      return NextResponse.json({ error: `firm.mode must be one of ${MODES.join(', ')}` }, { status: 400 })
    }
    // Firm codes are free-form (lhp, fears, jm…) — normalised, not validated
    // against a list, so adding a pipeline does not mean editing this file.
    const firms: string[] = Array.from(new Set<string>(
      (Array.isArray(body.firm.firms) ? body.firm.firms : [])
        .map((f: unknown) => String(f).trim().toLowerCase())
        .filter(Boolean)
    )).sort()
    if (mode !== 'off' && firms.length === 0) {
      return NextResponse.json({ error: 'Pick at least one firm, or set the firm filter to off.' }, { status: 400 })
    }
    patch.firm_filter_mode = mode
    patch.firm_filter_list = mode === 'off' ? [] : firms
    firmFilter = { mode, firms: mode === 'off' ? [] : firms }
  }

  const db = supabaseAdmin()
  const { data, error } = await db.from('dialer_queue_settings')
    .upsert(patch, { onConflict: 'id' })
    .select('state_filter_mode, state_filter_list, firm_filter_mode, firm_filter_list, updated_at')
    .single()

  if (error) {
    const missing = /firm_filter|column .* does not exist|schema cache/i.test(error.message)
    return NextResponse.json({
      error: missing
        ? 'Run supabase/migration_dialer_state_filter.sql to enable the firm filter.'
        : error.message,
    }, { status: missing ? 503 : 500 })
  }

  // Apply now: release queued leads the new rules reject, then top reps back up.
  const released = await releaseRejected(db, stateFilter, firmFilter)
  await fillAllReadyReps(5).catch(console.error)

  return NextResponse.json({
    released,
    state: { mode: data.state_filter_mode, states: data.state_filter_list },
    firm:  { mode: data.firm_filter_mode,  firms:  data.firm_filter_list },
    updated_at: data.updated_at,
  })
}

/** Un-buffer today's queued leads that the new rules reject. Leased leads are
    left alone — a rep is mid-call on those. Callbacks are exempt throughout. */
async function releaseRejected(
  db: ReturnType<typeof supabaseAdmin>,
  state: StateFilter | null,
  firm: FirmFilter | null,
): Promise<number> {
  if (!state && !firm) return 0
  if (state?.mode === 'off' && firm?.mode === 'off') return 0

  const { data } = await db.from('dialer_attempts')
    .select('id, phone, firm, is_callback')
    .eq('plan_date', todayEastern())
    .eq('status', 'buffered')

  const ids = (data ?? []).filter(a => {
    if (a.is_callback) return false
    if (state && !passesStateFilter(a.phone, state)) return true
    if (firm && !passesFirmFilter(a.firm, firm)) return true
    return false
  }).map(a => a.id)

  if (ids.length === 0) return 0

  await db.from('dialer_attempts')
    .update({
      status: 'pending', buffered_for: null, buffered_at: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)
    .eq('status', 'buffered')

  return ids.length
}
