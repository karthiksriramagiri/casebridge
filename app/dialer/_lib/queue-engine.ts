// CaseBridge Dialer — Attempt-Based Queue Engine
// Replaces the old dialer_queue approach with dialer_attempts (one row per
// planned call attempt, N per lead per day based on cadence rules).

import { createClient }                               from '@supabase/supabase-js'
import { resolveTimezone }                            from './area-codes'
import { BLOCKS_BY_COUNT, blockWindows, stagePriority } from './blocks'
import type { BlockName } from './blocks'
import { getNumberPool, assignRandomCallerId }         from './number-pool'

const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'
const PIPELINES = [
  { id: 'yMqNixSnChC5lcGQXA1g', firm: 'lhp',   defaultTz: 'America/Los_Angeles' },
  { id: 'Jj4DCdu5duYDgI87ERbx', firm: 'fears', defaultTz: 'America/Chicago'     },
]
// Stages synced into the queue (lower-cased for lookup)
const INCLUDED_STAGES = new Set([
  'contract sent', 'chase', 'follow up required', 'no response',
])

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${(process.env.GHL_API_KEY ?? '').trim()}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Attempt {
  id:                 string
  contact_id:         string
  contact_name:       string
  phone:              string
  firm:               string
  pipeline_id:        string
  stage_id:           string
  stage_name:         string
  ghl_opportunity_id: string | null
  plan_date:          string
  attempt_number:     number
  attempts_total:     number
  block:              string
  lead_timezone:      string
  due_from:           string
  due_until:          string
  day_ends_at:        string
  priority:           number
  is_carryover:       boolean
  status:             string
  buffered_for:       string | null
  buffered_at:        string | null
  leased_by:          string | null
  leased_at:          string | null
  lease_expires_at:   string | null
  completed_by:       string | null
  completed_at:       string | null
  disposition:        string | null
  call_sid:           string | null
  is_callback:        boolean
  callback_at:        string | null
  owner_rep:          string | null
  created_at:         string
  updated_at:         string
}

// ─── Date helper — always use Eastern midnight as the day boundary ────────────
// The reset cron runs at 5 AM UTC (= midnight EST), so plan_date must always
// reflect the current Eastern date, not UTC.
export function todayEastern(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// ─── Sync: GHL → dialer_attempts ─────────────────────────────────────────────

export async function syncGHLToQueue(): Promise<{
  created: number; updated: number; cancelled: number; skipped: number
}> {
  const db      = supabaseAdmin()
  const headers = ghlHeaders()
  const today   = todayEastern()  // YYYY-MM-DD

  // ── Batch-load reference data upfront (no per-lead queries) ──────────────
  const [rulesRes, stateRes, existingAttemptsRes] = await Promise.all([
    db.from('dialer_cadence_rules').select('stage_name, calls_per_day, enabled'),
    db.from('dialer_lead_state').select('contact_id, suppressed, exhausted, owner_rep'),
    db.from('dialer_attempts')
      .select('id, contact_id, attempt_number, status, stage_name, priority, is_callback')
      .eq('plan_date', today)
      .eq('is_callback', false),
  ])

  const cadence: Record<string, number> = {}
  for (const r of rulesRes.data ?? []) {
    if (r.enabled) cadence[r.stage_name.toLowerCase()] = r.calls_per_day
  }

  const skip      = new Set<string>()
  const ownerMap  = new Map<string, string | null>()
  for (const row of stateRes.data ?? []) {
    if (row.suppressed || row.exhausted) skip.add(row.contact_id)
    ownerMap.set(row.contact_id, row.owner_rep ?? null)
  }

  // Map: `${contactId}:${attemptNumber}` → existing row
  type ExistingAttempt = { id: string; status: string; stage_name: string; priority: number }
  const existingMap = new Map<string, ExistingAttempt>()
  for (const a of existingAttemptsRes.data ?? []) {
    existingMap.set(`${a.contact_id}:${a.attempt_number}`, a)
  }

  let created = 0, updated = 0, cancelled = 0, skipped = 0
  const seenContactIds = new Set<string>()

  // Batch accumulators — flushed at the end
  const toInsert:     Record<string, any>[] = []
  const toUpdate:     { id: string; stage_name: string; stage_id: string; priority: number }[] = []
  const toReactivate: { id: string; fields: Record<string, any> }[] = []

  // Fetch both pipeline schemas in parallel
  const pipelineSchemas = await Promise.all(
    PIPELINES.map(async pipeline => {
      const pRes = await fetch(
        `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${LOCATION_ID}`,
        { headers }
      )
      if (!pRes.ok) return null
      const pData = await pRes.json()
      const pl    = (pData.pipelines ?? []).find((p: any) => p.id === pipeline.id)
      return pl ? { pipeline, stages: pl.stages ?? [] } : null
    })
  )

  // Collect all (pipeline, stage) combos with included stages
  type StageJob = {
    pipeline: typeof PIPELINES[0]
    stage: { id: string; name: string }
    callsPerDay: number
    blocks: BlockName[]
    priority: number
  }
  const stageJobs: StageJob[] = []
  for (const schema of pipelineSchemas) {
    if (!schema) continue
    for (const stage of schema.stages) {
      const stageKey = stage.name.toLowerCase()
      if (!INCLUDED_STAGES.has(stageKey)) continue
      const callsPerDay = cadence[stageKey] ?? 2
      stageJobs.push({
        pipeline:   schema.pipeline,
        stage,
        callsPerDay,
        blocks:     (BLOCKS_BY_COUNT[callsPerDay] ?? BLOCKS_BY_COUNT[2]) as BlockName[],
        priority:   stagePriority(stageKey),
      })
    }
  }

  // Fetch all stages in parallel — pagination within each stage stays sequential
  await Promise.all(stageJobs.map(async ({ pipeline, stage, blocks, priority }) => {
    let cursor: string | null   = null
    let cursorId: string | null = null

    while (true) {
      const url = new URL('https://services.leadconnectorhq.com/opportunities/search')
      url.searchParams.set('location_id', LOCATION_ID)
      url.searchParams.set('pipeline_id',  pipeline.id)
      url.searchParams.set('pipeline_stage_id', stage.id)
      url.searchParams.set('limit', '100')
      if (cursor)   url.searchParams.set('startAfter',   cursor)
      if (cursorId) url.searchParams.set('startAfterId', cursorId)

      const res  = await fetch(url.toString(), { headers })
      if (!res.ok) break
      const data = await res.json()
      const opps = data.opportunities ?? []
      if (opps.length === 0) break

      for (const opp of opps) {
        const contact = opp.contact ?? {}
        const phone   =
          contact.phone ??
          (contact.phones?.find((p: any) => p.type === 'mobile') ?? contact.phones?.[0])?.number ??
          ''
        if (!phone || !opp.contactId) { skipped++; continue }
        if (skip.has(opp.contactId))  { skipped++; continue }

        seenContactIds.add(opp.contactId)

        const timezone = resolveTimezone(
          contact.timezone ?? opp.timezone,
          phone,
          pipeline.defaultTz
        )
        const ownerRep = ownerMap.get(opp.contactId) ?? null
        const windows  = blockWindows(today, blocks, timezone)

        for (let i = 0; i < windows.length; i++) {
          const win           = windows[i]
          const attemptNumber = i + 1
          const key           = `${opp.contactId}:${attemptNumber}`
          const existing      = existingMap.get(key)

          if (existing) {
            if (existing.status === 'cancelled') {
              // Re-activate with ALL correct fields (timezone, windows, stage, priority)
              toReactivate.push({ id: existing.id, fields: {
                status:        'pending',
                stage_name:    stage.name,
                stage_id:      stage.id,
                priority,
                lead_timezone: timezone,
                due_from:      win.dueFrom.toISOString(),
                due_until:     win.dueUntil.toISOString(),
                day_ends_at:   win.dayEndsAt.toISOString(),
                attempts_total: windows.length,
                owner_rep:     ownerRep,
                buffered_for:  null, buffered_at: null,
                leased_by:     null, leased_at: null, lease_expires_at: null,
                completed_by:  null, completed_at: null, disposition: null,
              }})
              updated++
            } else if (existing.status === 'pending' &&
                (existing.stage_name !== stage.name || existing.priority !== priority)) {
              toUpdate.push({ id: existing.id, stage_name: stage.name, stage_id: stage.id, priority })
              updated++
            }
            continue
          }

          toInsert.push({
            contact_id:         opp.contactId,
            contact_name:       opp.name ?? contact.name ?? 'Unknown',
            phone,
            firm:               pipeline.firm,
            pipeline_id:        pipeline.id,
            stage_id:           stage.id,
            stage_name:         stage.name,
            ghl_opportunity_id: opp.id ?? null,
            plan_date:          today,
            attempt_number:     attemptNumber,
            attempts_total:     windows.length,
            block:              win.block,
            lead_timezone:      timezone,
            due_from:           win.dueFrom.toISOString(),
            due_until:          win.dueUntil.toISOString(),
            day_ends_at:        win.dayEndsAt.toISOString(),
            priority,
            owner_rep:          ownerRep,
          })
          created++
        }
      }

      cursor   = data.meta?.startAfter   ?? null
      cursorId = data.meta?.startAfterId ?? null
      if (!cursor && !cursorId) break
    }
  }))

  // ── Flush batches ─────────────────────────────────────────────────────────
  const now = new Date().toISOString()

  // Batch insert in chunks of 500
  for (let i = 0; i < toInsert.length; i += 500) {
    await db.from('dialer_attempts').insert(toInsert.slice(i, i + 500))
  }

  // Batch stage/priority updates for pending rows
  type UpdateGroup = { stage_name: string; stage_id: string; priority: number; ids: string[] }
  const updateGroups = new Map<string, UpdateGroup>()
  for (const u of toUpdate) {
    const k = `${u.stage_name}:${u.stage_id}:${u.priority}`
    if (!updateGroups.has(k)) updateGroups.set(k, { stage_name: u.stage_name, stage_id: u.stage_id, priority: u.priority, ids: [] })
    updateGroups.get(k)!.ids.push(u.id)
  }
  for (const g of updateGroups.values()) {
    await db.from('dialer_attempts')
      .update({ stage_name: g.stage_name, stage_id: g.stage_id, priority: g.priority, updated_at: now })
      .in('id', g.ids)
  }

  // Reactivate cancelled attempts with fully corrected fields (timezone, windows, stage)
  // Process in chunks of 50 to avoid hitting query limits
  for (let i = 0; i < toReactivate.length; i += 50) {
    await Promise.all(
      toReactivate.slice(i, i + 50).map(r =>
        db.from('dialer_attempts').update({ ...r.fields, updated_at: now }).eq('id', r.id)
      )
    )
  }

  // Cancel pending attempts for leads no longer in any included stage
  const { data: pendingAttempts } = await db.from('dialer_attempts')
    .select('id, contact_id')
    .eq('plan_date', today)
    .eq('status', 'pending')
    .eq('is_callback', false)
  const toCancel = (pendingAttempts ?? []).filter(a => !seenContactIds.has(a.contact_id))
  if (toCancel.length > 0) {
    await db.from('dialer_attempts')
      .update({ status: 'cancelled', updated_at: now })
      .in('id', toCancel.map(a => a.id))
    cancelled += toCancel.length
  }

  // Re-fill all READY reps so new leads are assigned contiguously
  await fillAllReadyReps(5).catch(console.error)

  return { created, updated, cancelled, skipped }
}

// ─── Buffer management ────────────────────────────────────────────────────────

// Fill rep's buffer to `count`.
// Replaces the Postgres RPC — does selection in TS so we can call it
// at any time (the RPC had a due_from <= now() gate that blocked pre-loading).
// Concurrency guard: UPDATE ... WHERE status='pending' ensures only one rep
// wins if two requests race for the same lead.
export async function fillBuffer(repIdentity: string, count = 5): Promise<Attempt[]> {
  const db    = supabaseAdmin()
  const today = todayEastern()
  const now   = new Date()

  // Whitelist: only active REP users can receive leads
  const { data: user } = await db.from('dialer_users')
    .select('role, active')
    .eq('twilio_identity', repIdentity)
    .maybeSingle()
  if (!user || user.role !== 'REP' || !user.active) return []

  // ── Force-buffer due callbacks owned by this rep (bypass buffer limit) ──
  const { data: dueCallbacks } = await db.from('dialer_attempts')
    .select('id')
    .eq('status', 'pending')
    .eq('plan_date', today)
    .eq('is_callback', true)
    .eq('owner_rep', repIdentity)
    .lte('due_from', now.toISOString())

  if (dueCallbacks?.length) {
    const nowIso = now.toISOString()
    await db.from('dialer_attempts')
      .update({ status: 'buffered', buffered_for: repIdentity, buffered_at: nowIso, updated_at: nowIso })
      .in('id', dueCallbacks.map(a => a.id))
      .eq('status', 'pending')
    console.log(`[fillBuffer] force-buffered ${dueCallbacks.length} due callback(s) for ${repIdentity}`)
  }

  // How many already buffered/leased for this rep?
  // Must check BOTH buffered_for and leased_by — leased leads have buffered_for=null
  const { data: existing } = await db.from('dialer_attempts')
    .select('id')
    .eq('plan_date', today)
    .in('status', ['buffered', 'leased'])
    .or(`buffered_for.eq.${repIdentity},leased_by.eq.${repIdentity}`)
  const current = existing?.length ?? 0
  const needed  = count - current
  if (needed <= 0) return []

  // Only filter: contacts already in buffer/on call (can't assign same lead to two reps)
  const { data: activeRes } = await db.from('dialer_attempts')
    .select('contact_id')
    .eq('plan_date', today)
    .in('status', ['buffered', 'leased'])
  const activeConts = new Set((activeRes ?? []).map((r: any) => r.contact_id))

  // Query with DB-side ORDER BY — matches admin queue display exactly
  // due_from <= now: keeps leads paused until their block opens (e.g. LHP at 8:30 AM PST)
  // No due_from in sort: once both blocks are active, firms interleave by priority
  const { data: pending } = await db.from('dialer_attempts')
    .select('*')
    .eq('status', 'pending')
    .eq('plan_date', today)
    .lte('due_from', now.toISOString())
    .gt('day_ends_at', now.toISOString())
    .order('is_callback',    { ascending: false })
    .order('is_carryover',   { ascending: false })
    .order('priority',       { ascending: false })
    .order('attempt_number', { ascending: true })
    .order('created_at',     { ascending: true })
    .order('id',             { ascending: true })

  if (!pending?.length) return []

  // Sequential constraint: only serve attempt N if all earlier attempts are done
  const pendingByContact = new Map<string, number[]>()
  for (const a of pending as Attempt[]) {
    if (!a.is_callback) {
      const arr = pendingByContact.get(a.contact_id) ?? []
      arr.push(a.attempt_number)
      pendingByContact.set(a.contact_id, arr)
    }
  }

  // Filter: active contacts + sequential constraint + callback ownership (preserving DB order)
  const eligible = (pending as Attempt[]).filter(a => {
    if (activeConts.has(a.contact_id)) return false
    // Callbacks are exclusive to their owner rep — don't assign to anyone else
    if (a.is_callback && a.owner_rep && a.owner_rep !== repIdentity) return false
    if (!a.is_callback) {
      const nums = pendingByContact.get(a.contact_id) ?? []
      if (a.attempt_number !== Math.min(...nums)) return false
    }
    return true
  })

  const toBuffer = eligible.slice(0, needed)
  if (!toBuffer.length) return []

  const nowIso = now.toISOString()
  const { data: buffered, error } = await db.from('dialer_attempts')
    .update({ status: 'buffered', buffered_for: repIdentity, buffered_at: nowIso, updated_at: nowIso })
    .in('id', toBuffer.map(a => a.id))
    .eq('status', 'pending')   // concurrency guard: only wins if still pending
    .select()

  if (error) {
    console.error('[fillBuffer] update error', error)
    return []
  }
  return (buffered ?? []) as Attempt[]
}

// Fill buffer for ALL READY reps in one pass — contiguous blocks, no gaps.
// Releases existing buffers first, then reassigns from scratch to guarantee
// contiguity even after new leads are added by sync.
export async function fillAllReadyReps(count = 5): Promise<Record<string, number>> {
  const db    = supabaseAdmin()
  const today = todayEastern()
  const now   = new Date()

  // Get READY reps — whitelist: ONLY users in dialer_users with role=REP
  // This excludes ADMIN users AND phantom identities like "agent" that aren't real users
  const [{ data: repStatuses }, { data: users }] = await Promise.all([
    db.from('dialer_rep_status').select('rep_identity, status').eq('status', 'READY'),
    db.from('dialer_users').select('twilio_identity, role, active'),
  ])
  const validRepIds = new Set(
    (users ?? []).filter(u => u.role === 'REP' && u.active).map(u => u.twilio_identity)
  )
  const readyReps = (repStatuses ?? [])
    .map(r => r.rep_identity)
    .filter(id => validRepIds.has(id))
  if (readyReps.length === 0) return {}

  // Release buffered leads from INVALID identities (admin, agent, unknown)
  // so they go back to the pending pool
  const { data: allBuffered } = await db.from('dialer_attempts')
    .select('id, buffered_for')
    .eq('plan_date', today)
    .eq('status', 'buffered')
  const invalidIds = (allBuffered ?? [])
    .filter(a => a.buffered_for && !validRepIds.has(a.buffered_for))
    .map(a => a.id)
  if (invalidIds.length > 0) {
    await db.from('dialer_attempts')
      .update({ status: 'pending', buffered_for: null, buffered_at: null, updated_at: now.toISOString() })
      .in('id', invalidIds)
  }

  // Count existing buffered + leased leads per rep (no release-and-reassign —
  // that pattern races with concurrent fillBuffer calls and causes double-buffering)
  const { data: assignedRes } = await db.from('dialer_attempts')
    .select('buffered_for, leased_by, status')
    .eq('plan_date', today)
    .in('status', ['buffered', 'leased'])
    .or(readyReps.map(r => `buffered_for.eq.${r},leased_by.eq.${r}`).join(','))
  const assignedCounts: Record<string, number> = {}
  for (const r of assignedRes ?? []) {
    const rep = r.status === 'leased' ? r.leased_by : r.buffered_for
    if (rep) assignedCounts[rep] = (assignedCounts[rep] ?? 0) + 1
  }

  // Each rep needs (count - already assigned)
  const repsNeedingLeads = readyReps
    .map(rep => ({ rep, needed: count - (assignedCounts[rep] ?? 0) }))
    .filter(r => r.needed > 0)
  if (repsNeedingLeads.length === 0) return {}

  // Contacts already buffered or leased by OTHER reps (non-ready reps still have leads)
  const { data: activeRes } = await db.from('dialer_attempts')
    .select('contact_id')
    .eq('plan_date', today)
    .in('status', ['buffered', 'leased'])
  const activeConts = new Set((activeRes ?? []).map((r: any) => r.contact_id))

  // Query with DB-side ORDER BY — matches admin queue display exactly
  // due_from <= now: keeps leads paused until their block opens (e.g. LHP at 8:30 AM PST)
  const { data: pending } = await db.from('dialer_attempts')
    .select('*')
    .eq('status', 'pending')
    .eq('plan_date', today)
    .lte('due_from', now.toISOString())
    .gt('day_ends_at', now.toISOString())
    .order('is_callback',    { ascending: false })
    .order('is_carryover',   { ascending: false })
    .order('priority',       { ascending: false })
    .order('attempt_number', { ascending: true })
    .order('created_at',     { ascending: true })
    .order('id',             { ascending: true })

  if (!pending?.length) return {}

  // Sequential constraint
  const pendingByContact = new Map<string, number[]>()
  for (const a of pending as Attempt[]) {
    if (!a.is_callback) {
      const arr = pendingByContact.get(a.contact_id) ?? []
      arr.push(a.attempt_number)
      pendingByContact.set(a.contact_id, arr)
    }
  }

  // Filter: active contacts + sequential constraint + callback ownership (preserving DB order)
  const eligible = (pending as Attempt[]).filter(a => {
    if (activeConts.has(a.contact_id)) return false
    if (!a.is_callback) {
      const nums = pendingByContact.get(a.contact_id) ?? []
      if (a.attempt_number !== Math.min(...nums)) return false
    }
    return true
  })

  // Assign contiguous blocks: rep A gets 1-5, rep B gets 6-10, etc.
  // BUT callbacks go to their owner rep first, not round-robin
  const toUpdate: { id: string; rep: string }[] = []
  const repNeeds = new Map(repsNeedingLeads.map(r => [r.rep, r.needed]))

  // Pass 1: route callbacks to their owner rep
  const remainingEligible: typeof eligible = []
  for (const a of eligible) {
    if (a.is_callback && a.owner_rep && repNeeds.has(a.owner_rep)) {
      const left = repNeeds.get(a.owner_rep)!
      if (left > 0) {
        toUpdate.push({ id: a.id, rep: a.owner_rep })
        repNeeds.set(a.owner_rep, left - 1)
        continue
      }
    }
    remainingEligible.push(a)
  }

  // Pass 2: regular round-robin for non-callback leads
  let idx = 0
  for (const { rep } of repsNeedingLeads) {
    let left = repNeeds.get(rep) ?? 0
    while (left > 0 && idx < remainingEligible.length) {
      toUpdate.push({ id: remainingEligible[idx].id, rep })
      left--
      idx++
    }
  }
  if (toUpdate.length === 0) return {}

  // Batch update — one UPDATE per rep
  const nowIso = now.toISOString()
  const result: Record<string, number> = {}
  const byRep = new Map<string, string[]>()
  for (const { id, rep } of toUpdate) {
    const arr = byRep.get(rep) ?? []
    arr.push(id)
    byRep.set(rep, arr)
  }
  await Promise.all(Array.from(byRep.entries()).map(async ([rep, ids]) => {
    const { data } = await db.from('dialer_attempts')
      .update({ status: 'buffered', buffered_for: rep, buffered_at: nowIso, updated_at: nowIso })
      .in('id', ids)
      .eq('status', 'pending')
      .select('id')
    result[rep] = data?.length ?? 0
  }))

  return result
}

// Release all buffered attempts back to pending (rep went PAUSED/OFFLINE)
export async function releaseBuffer(repIdentity: string): Promise<void> {
  const db    = supabaseAdmin()
  const today = todayEastern()
  await db.from('dialer_attempts')
    .update({
      status:       'pending',
      buffered_for: null,
      buffered_at:  null,
      updated_at:   new Date().toISOString(),
    })
    .eq('buffered_for', repIdentity)
    .eq('status', 'buffered')
    .eq('plan_date', today)
}

// ─── Get next attempt (lease it) ─────────────────────────────────────────────

// Pull the rep's first buffered attempt, set it to leased, return it.
// If buffer is empty, fills it first (synchronous).
export async function getNextAttempt(repIdentity: string): Promise<Attempt | null> {
  const db    = supabaseAdmin()
  const today = todayEastern()
  const now   = new Date()

  // Ensure there's something in the buffer
  await fillBuffer(repIdentity, 5)

  // Callbacks for this rep that are due right now take absolute precedence
  const { data: callbackFirst } = await db.from('dialer_attempts')
    .select('*')
    .eq('status', 'buffered')
    .eq('buffered_for', repIdentity)
    .eq('plan_date', today)
    .eq('is_callback', true)
    .lte('callback_at', now.toISOString())
    .order('callback_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: nextRow } = callbackFirst
    ? { data: callbackFirst }
    : await db.from('dialer_attempts')
        .select('*')
        .eq('status', 'buffered')
        .eq('buffered_for', repIdentity)
        .eq('plan_date', today)
        .order('buffered_at',    { ascending: true })
        .order('priority',       { ascending: false })
        .order('is_carryover',   { ascending: false })
        .order('attempt_number', { ascending: true })
        .limit(1)
        .maybeSingle()

  if (!nextRow) return null

  const leaseExpiry = new Date(now.getTime() + 5 * 60 * 1000) // 5 min lease

  const { data: leased } = await db.from('dialer_attempts')
    .update({
      status:          'leased',
      leased_by:       repIdentity,
      leased_at:       now.toISOString(),
      lease_expires_at: leaseExpiry.toISOString(),
      buffered_for:    null,   // no longer in buffer
      buffered_at:     null,
      updated_at:      now.toISOString(),
    })
    .eq('id', nextRow.id)
    .eq('status', 'buffered') // guard: must still be buffered
    .select('*')
    .single()

  if (!leased) return null // race-condition guard: someone else took it

  // Do NOT backfill here — top-up happens after disposition (completed call).
  // Backfilling on dial caused over-assignment (rep had 4 buffered + 1 leased
  // but fillBuffer only counted buffered_for, so it added extras).

  return leased as Attempt
}

// Extend the lease while a call is live
export async function extendLease(attemptId: string): Promise<void> {
  const db = supabaseAdmin()
  await db.from('dialer_attempts')
    .update({ lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
    .eq('id', attemptId)
    .eq('status', 'leased')
}

// Release lease (call dropped, no disposition submitted)
export async function releaseLease(attemptId: string): Promise<void> {
  const db = supabaseAdmin()
  await db.from('dialer_attempts')
    .update({
      status:          'pending',
      leased_by:       null,
      leased_at:       null,
      lease_expires_at: null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', attemptId)
    .eq('status', 'leased')
}

// ─── Disposition ──────────────────────────────────────────────────────────────

export interface DispositionOptions {
  repIdentity:     string
  callDuration:    number
  callbackAt?:     string  // ISO, in lead's local time (frontend converts)
  callbackContext?: string
  callSid?:        string
  firm?:           string  // 'lhp' | 'fears'
  nqReason?:       string  // reason for Not Qualified
}

export async function applyDisposition(
  attemptId:   string,
  disposition: string,
  opts:        DispositionOptions,
): Promise<void> {
  const db  = supabaseAdmin()
  const now = new Date()

  const { data: attempt } = await db.from('dialer_attempts')
    .select('*').eq('id', attemptId).single()
  if (!attempt) return

  // A "real conversation" establishes ownership
  const isRealConversation =
    opts.callDuration > 60 ||
    ['Callback', 'Qualified', 'Signed'].includes(disposition)

  // ── Mark attempt completed ───────────────────────────────────────────────
  await db.from('dialer_attempts').update({
    status:       'completed',
    completed_by: opts.repIdentity,
    completed_at: now.toISOString(),
    disposition,
    call_sid:     opts.callSid ?? null,
    leased_by:    null,
    leased_at:    null,
    lease_expires_at: null,
    updated_at:   now.toISOString(),
  }).eq('id', attemptId)

  // ── Update lead state ────────────────────────────────────────────────────
  const stateUpdate: Record<string, unknown> = {
    last_dialed_at:   now.toISOString(),
    last_disposition: disposition,
    updated_at:       now.toISOString(),
  }

  if (isRealConversation) {
    // Set ownership if not already set
    const { data: currentState } = await db.from('dialer_lead_state')
      .select('owner_rep').eq('contact_id', attempt.contact_id).maybeSingle()
    if (!currentState?.owner_rep) {
      stateUpdate.owner_rep     = opts.repIdentity
      stateUpdate.owner_set_at  = now.toISOString()
    }
  }

  await db.from('dialer_lead_state').upsert(
    { contact_id: attempt.contact_id, ...stateUpdate },
    { onConflict: 'contact_id' }
  )

  // ── Disposition-specific effects ─────────────────────────────────────────
  const today = now.toISOString().split('T')[0]
  const firm  = opts.firm || attempt.firm || ''

  switch (disposition) {
    // No Answer — later attempts today stand unchanged
    case 'No Answer': {
      // Assign a persistent random caller ID for NR leads (used on all retries)
      const { data: ls } = await db.from('dialer_lead_state')
        .select('assigned_caller_id, sms_drip_active')
        .eq('contact_id', attempt.contact_id)
        .maybeSingle()

      if (!ls?.assigned_caller_id) {
        const pool = await getNumberPool()
        const assignedId = assignRandomCallerId(pool)
        if (assignedId) {
          await db.from('dialer_lead_state')
            .update({ assigned_caller_id: assignedId, updated_at: now.toISOString() })
            .eq('contact_id', attempt.contact_id)
        }
      }

      // Start SMS drip on first No Answer (only if never had drip before)
      if (!ls?.sms_drip_active) {
        const { hasDripHistory, scheduleDrip } = await import('./sms-drip')
        const hadDrip = await hasDripHistory(attempt.contact_id)
        if (!hadDrip) {
          scheduleDrip({
            contactId:   attempt.contact_id,
            contactName: attempt.contact_name,
            phone:       attempt.phone,
            firm:        attempt.firm ?? null,
          }).catch(err => console.error('[sms-drip] schedule error', err))
        }
      }
      break
    }

    case 'Callback': {
      // Cancel remaining attempts today, create a callback attempt
      await cancelRemainingAttempts(attempt.contact_id, today, attemptId, db)

      const cbAt = opts.callbackAt ? new Date(opts.callbackAt) : new Date(now.getTime() + 4 * 3600 * 1000)

      // Determine owner (the owner who scheduled it, or this rep)
      const { data: ls } = await db.from('dialer_lead_state')
        .select('owner_rep').eq('contact_id', attempt.contact_id).maybeSingle()
      const callbackOwner = ls?.owner_rep ?? opts.repIdentity

      await db.from('dialer_attempts').insert({
        contact_id:         attempt.contact_id,
        contact_name:       attempt.contact_name,
        phone:              attempt.phone,
        firm:               attempt.firm,
        pipeline_id:        attempt.pipeline_id,
        stage_id:           attempt.stage_id,
        stage_name:         attempt.stage_name,
        ghl_opportunity_id: attempt.ghl_opportunity_id,
        plan_date:          today,
        attempt_number:     99,  // sentinel for callback
        attempts_total:     attempt.attempts_total,
        block:              'morning',     // placeholder
        lead_timezone:      attempt.lead_timezone,
        due_from:           cbAt.toISOString(),
        due_until:          cbAt.toISOString(),
        day_ends_at:        attempt.day_ends_at,  // same day
        priority:           500,   // callbacks are top priority
        is_callback:        true,
        callback_at:        cbAt.toISOString(),
        owner_rep:          callbackOwner,
      })
      break
    }

    // Terminal: remove from calling pool
    case 'Qualified':
    case 'Signed':
      await cancelRemainingAttempts(attempt.contact_id, today, attemptId, db)
      // Clear NR caller ID assignment (lead is no longer in NR rotation)
      await db.from('dialer_lead_state')
        .update({ assigned_caller_id: null, updated_at: now.toISOString() })
        .eq('contact_id', attempt.contact_id)
      break

    // Exhausted: lead won't appear in future syncs
    case 'Not Qualified':
      await cancelRemainingAttempts(attempt.contact_id, today, attemptId, db)
      await db.from('dialer_lead_state').upsert(
        { contact_id: attempt.contact_id, exhausted: true, updated_at: now.toISOString() },
        { onConflict: 'contact_id' }
      )
      break
  }

  // ── Update ownership on remaining attempts if ownership was just set ──────
  if (isRealConversation) {
    const { data: ls } = await db.from('dialer_lead_state')
      .select('owner_rep').eq('contact_id', attempt.contact_id).maybeSingle()
    if (ls?.owner_rep) {
      await db.from('dialer_attempts')
        .update({ owner_rep: ls.owner_rep, updated_at: now.toISOString() })
        .eq('contact_id', attempt.contact_id)
        .in('status', ['pending', 'buffered'])
        .eq('plan_date', today)
    }
  }

  // ── GHL stage move ────────────────────────────────────────────────────────
  const GHL_STAGE_MAP: Record<string, string> = {
    'Not Qualified': 'Not Qualified',
    'Qualified':     'Chase',
    'Callback':      'Follow Up Required',
    'Signed':        'Signed/Sent',
    'No Answer':     'No Response',
  }
  const targetStage = GHL_STAGE_MAP[disposition]

  // No Answer: only move to "No Response" on first NR (skip if already NR)
  let skipStageMove = false
  if (disposition === 'No Answer') {
    const { data: prevState } = await db.from('dialer_lead_state')
      .select('last_disposition')
      .eq('contact_id', attempt.contact_id)
      .maybeSingle()
    if (prevState?.last_disposition === 'No Answer') {
      skipStageMove = true
      console.log('[disposition] Skipping NR stage move — lead already in No Response', { contactId: attempt.contact_id })
    }
  }

  if (targetStage && attempt.ghl_opportunity_id && !skipStageMove) {
    console.log('[disposition] Moving GHL stage', { opportunityId: attempt.ghl_opportunity_id, targetStage })
    await moveGHLStage(attempt.ghl_opportunity_id, attempt.pipeline_id, targetStage).catch(err =>
      console.error('[disposition] GHL stage move failed', err)
    )
  } else if (targetStage && !attempt.ghl_opportunity_id) {
    console.log('[disposition] Skipping GHL stage move — no opportunity ID', { contactId: attempt.contact_id, disposition })
  }

  // ── Firm-specific GHL tags ─────────────────────────────────────────────────
  const TAG_MAP: Record<string, Record<string, string>> = {
    lhp: {
      'Qualified':     'lhp - c',
      'Not Qualified': 'lhp - nq',
      'Callback':      'lhp - ap',
      'No Answer':     'lhp - nr',
      'Signed':        'lhp - ps',
    },
    fears: {
      'Qualified':     'fl - c',
      'Not Qualified': 'fl - nq',
      'Callback':      'fl - ap',
      'No Answer':     'fl - nr',
      'Signed':        'fl - ps',
    },
  }

  const tag = TAG_MAP[firm]?.[disposition]
  if (tag && attempt.contact_id) {
    await tagGHLContact(attempt.contact_id, [tag]).catch(err =>
      console.error('[disposition] GHL tag failed', err)
    )
  } else if (!tag) {
    console.log('[disposition] No tag mapping for', { firm, disposition })
  }

  // ── Turn off SMS bot on any real disposition ────────────────────────────
  if (['Callback', 'Qualified', 'Not Qualified', 'Signed'].includes(disposition) && attempt.contact_id) {
    await db.from('dialer_lead_state')
      .update({ sms_drip_active: false, updated_at: now.toISOString() })
      .eq('contact_id', attempt.contact_id)
    // Cancel any pending drip messages
    await db.from('dialer_drip_queue')
      .update({ status: 'cancelled', updated_at: now.toISOString() })
      .eq('contact_id', attempt.contact_id)
      .eq('status', 'pending')
    console.log('[disposition] SMS bot turned off', { contactId: attempt.contact_id, disposition })
  }

  // Store NQ reason as a tag + send Slack notification
  if (disposition === 'Not Qualified' && attempt.contact_id) {
    if (opts.nqReason) {
      const reasonTag = firm === 'lhp'
        ? `lhp - nq - ${opts.nqReason}`
        : `fl - nq - ${opts.nqReason}`
      await tagGHLContact(attempt.contact_id, [reasonTag]).catch(console.error)
    }

    // Slack notification for NQ disposition
    const slackWebhook = (process.env.SLACK_WEBHOOK_URL || '').trim().replace(/\\n$/, '')
    if (slackWebhook) {
      const firmLabel = firm === 'lhp' ? 'LHP' : firm === 'fears' ? 'Fears' : firm.toUpperCase()
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Not Qualified — ${attempt.contact_name} (${firmLabel})`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `*Not Qualified* — ${attempt.contact_name}`,
                  `*Firm:* ${firmLabel}`,
                  `*Phone:* ${attempt.phone}`,
                  `*Rep:* ${opts.repIdentity}`,
                  opts.nqReason ? `*Reason:* ${opts.nqReason}` : null,
                  `*Stage:* ${attempt.stage_name || '—'}`,
                ].filter(Boolean).join('\n'),
              },
            },
          ],
        }),
      }).catch(err => console.error('[disposition] Slack NQ notification failed', err))
    }
  }

  // Slack notification for Qualified/Signed
  if (['Qualified', 'Signed'].includes(disposition) && attempt.contact_id) {
    const slackWebhook = (process.env.SLACK_WEBHOOK_URL || '').trim().replace(/\\n$/, '')
    if (slackWebhook) {
      const firmLabel = firm === 'lhp' ? 'LHP' : firm === 'fears' ? 'Fears' : firm.toUpperCase()
      const emoji = disposition === 'Signed' ? ':tada:' : ':white_check_mark:'
      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${disposition} — ${attempt.contact_name} (${firmLabel})`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `${emoji} *${disposition}* — ${attempt.contact_name}`,
                  `*Firm:* ${firmLabel}`,
                  `*Phone:* ${attempt.phone}`,
                  `*Rep:* ${opts.repIdentity}`,
                  `*Stage:* ${attempt.stage_name || '—'}`,
                ].filter(Boolean).join('\n'),
              },
            },
          ],
        }),
      }).catch(err => console.error('[disposition] Slack notification failed', err))
    }
  }
}

async function cancelRemainingAttempts(
  contactId:       string,
  planDate:        string,
  excludeAttemptId: string,
  db: ReturnType<typeof supabaseAdmin>,
) {
  await db.from('dialer_attempts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('contact_id', contactId)
    .eq('plan_date', planDate)
    .in('status', ['pending', 'buffered'])
    .neq('id', excludeAttemptId)
}

// ─── Reset day ────────────────────────────────────────────────────────────────

export async function resetDay(): Promise<void> {
  const db    = supabaseAdmin()
  const today = todayEastern()
  await db.from('dialer_attempts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('plan_date', today)
    .in('status', ['pending', 'buffered', 'leased', 'expired'])
}

// ─── GHL helpers ─────────────────────────────────────────────────────────────

async function moveGHLStage(opportunityId: string, pipelineId: string, targetStageName: string) {
  const headers = ghlHeaders()
  const pRes = await fetch(
    `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${LOCATION_ID}`,
    { headers }
  )
  if (!pRes.ok) {
    console.error('[moveGHLStage] Failed to fetch pipelines', pRes.status)
    return
  }
  const pData    = await pRes.json()
  const pipeline = (pData.pipelines ?? []).find((p: any) => p.id === pipelineId)
  if (!pipeline) {
    console.error('[moveGHLStage] Pipeline not found', { pipelineId })
    return
  }
  const stage = (pipeline.stages ?? []).find(
    (s: any) => s.name.toLowerCase() === targetStageName.toLowerCase()
  )
  if (!stage) {
    console.error('[moveGHLStage] Stage not found', {
      targetStageName,
      availableStages: (pipeline.stages ?? []).map((s: any) => s.name),
    })
    return
  }
  const moveRes = await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunityId}`, {
    method:  'PUT',
    headers,
    body:    JSON.stringify({ pipelineStageId: stage.id }),
  })
  if (!moveRes.ok) {
    console.error('[moveGHLStage] Move failed', moveRes.status, await moveRes.text().catch(() => ''))
  } else {
    console.log('[moveGHLStage] Moved opportunity', { opportunityId, stage: stage.name })
  }
}

async function tagGHLContact(contactId: string, newTags: string[]) {
  const headers = ghlHeaders()
  const cRes = await fetch(
    `https://services.leadconnectorhq.com/contacts/${contactId}`,
    { headers }
  )
  if (!cRes.ok) return
  const cData   = await cRes.json()
  const existing = cData.contact?.tags ?? []
  const merged   = Array.from(new Set([...existing, ...newTags]))
  await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    method:  'PUT',
    headers,
    body:    JSON.stringify({ tags: merged }),
  })
}

// ─── DNC check ───────────────────────────────────────────────────────────────
// Used by call-start endpoint to block suppressed leads
export async function isLeadSuppressed(contactId: string): Promise<boolean> {
  const db = supabaseAdmin()
  const { data } = await db.from('dialer_lead_state')
    .select('suppressed').eq('contact_id', contactId).maybeSingle()
  return data?.suppressed === true
}
