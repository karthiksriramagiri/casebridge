// CaseBridge Dialer — Attempt-Based Queue Engine
// Replaces the old dialer_queue approach with dialer_attempts (one row per
// planned call attempt, N per lead per day based on cadence rules).

import { createClient }                               from '@supabase/supabase-js'
import { resolveTimezone, stateForPhone }             from './area-codes'
import type { BlockName } from './blocks'
import {
  BLOCKS_BY_COUNT, blockWindows, stagePriority,
  TODAY_RANK, MAX_LEAD_AGE_DAYS, TODAY_ATTEMPTS, todayWindows,
  APPOINTMENT_MISSED_RANK, inWindow,
} from './blocks'
import { getNumberPool, assignRandomCallerId }         from './number-pool'
import { getPipelines, ghlFetch }                     from '@/lib/ghl-pipelines'

const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'
const PIPELINES = [
  { id: 'yMqNixSnChC5lcGQXA1g', firm: 'lhp',   lang: 'en', defaultTz: 'America/Los_Angeles' },
  { id: 'r1AsAtC7lzwO9ybtkQlA', firm: 'lhp',   lang: 'es', defaultTz: 'America/Los_Angeles' },
  { id: 'Jj4DCdu5duYDgI87ERbx', firm: 'fears', lang: 'en', defaultTz: 'America/Chicago'     },
  { id: '0tBzhg0eGSNKL870y3yV', firm: 'jm',    lang: 'en', defaultTz: 'America/Los_Angeles' },
]
// Stages synced into the queue (lower-cased for lookup)
const INCLUDED_STAGES = new Set([
  // Appointment Scheduled tops the ladder but was never queued — it was
  // missing from this set, so those leads reached no rep at all.
  'appointment scheduled',
  'contract sent', 'chase', 'follow up required', 'no response', 'mia',
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
  lang:               string
  stage_changed_at:   string | null
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

  // ── Check if stage_changed_at column exists (safe migration gate) ────────
  const { error: colCheck } = await db.from('dialer_attempts').select('stage_changed_at').limit(0)
  const hasStageChangedAt = !colCheck

  // ── Batch-load reference data upfront (no per-lead queries) ──────────────
  const [rulesRes, stateRes, existingAttemptsRes] = await Promise.all([
    db.from('dialer_cadence_rules').select('stage_name, calls_per_day, enabled'),
    db.from('dialer_lead_state').select('contact_id, suppressed, exhausted, owner_rep'),
    db.from('dialer_attempts')
      .select('id, contact_id, attempt_number, status, stage_name, priority, is_callback, stage_changed_at')
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
  const queuedKeys = new Set<string>()
  const toInsert:     Record<string, any>[] = []
  const toUpdate:     { id: string; stage_name: string; stage_id: string; priority: number; stage_changed_at: string | null }[] = []
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
  /* Set if any stage fetch ends early. The cancellation sweep below keys off
     "contacts GHL did not return", so a sweep that stopped halfway makes
     every unseen lead look deleted. */
  let sweepIncomplete = false

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

      /* ghlFetch, not fetch: this sweep walks every pipeline and stage, and
         it now runs every ten minutes instead of once a day. Overlapping runs
         cross GHL's 100-requests-per-10-seconds burst window easily, and a
         bare fetch would take the 429 and `break` — silently truncating the
         queue to whatever had loaded so far. */
      const res  = await ghlFetch(url.toString(), { headers })
      if (!res.ok) {
        console.error('[queue:sync] GHL %d on %s / %s — stage truncated',
          res.status, pipeline.firm, stage.name)
        sweepIncomplete = true
        break
      }
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

        /* A lead that has sat in its stage for three weeks is not worth a dial
           against one from this morning. This used to apply only to No
           Response, which left Contract Sent unbounded — a median age of 30
           days, with more than half the stage past the limit. Dropped at sync
           so a stale lead never reaches the queue, rather than filtered at
           serve time where it would still be counted and shown.

           A lead dropped here is absent from seenContactIds, so its pending
           attempts are cancelled by the sweep below. Callbacks are exempt from
           that sweep: a promised time is kept whatever the lead's age. */
        const stageEnteredAt = opp.lastStageChangeAt ?? opp.updatedAt ?? null
        const stageAgeDays = stageEnteredAt
          ? (Date.now() - Date.parse(stageEnteredAt)) / 86_400_000
          : null
        if (stageAgeDays !== null && stageAgeDays > MAX_LEAD_AGE_DAYS) { skipped++; continue }

        seenContactIds.add(opp.contactId)

        const timezone = resolveTimezone(
          contact.timezone ?? opp.timezone,
          phone,
          pipeline.defaultTz
        )
        /* Ownership is no longer carried on regular leads: any rep takes the
           next lead off one shared ladder. Callbacks are the exception and
           set their own owner when they are booked — a callback is a promise
           a named rep made for a stated time, and handing it to someone else
           means a lead is rung by a stranger. */
        const ownerRep = null

        /* A lead that arrived today is chased on its own clock: six attempts
           ninety minutes apart, counted from when it landed, so one that
           comes in at 2pm is called at 2pm rather than waiting for the next
           fixed block to open. Everything older keeps the block schedule,
           which spreads an aged list across the day instead of firing it all
           at once. */
        const changedAt = opp.lastStageChangeAt ?? opp.updatedAt ?? null
        /* Not for appointments. An appointment is a booked event — it is
           called at its time, once, and the cadence rule says 1/day. Giving
           it the six-attempt treatment put one lead in six consecutive slots
           at the very top of the list. */
        const isTodayLead = !!changedAt
          && stage.name.toLowerCase() !== 'appointment scheduled'
          && new Date(changedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === today

        const blockWins = blockWindows(today, blocks, timezone)
        const dayEndsAt = blockWins[0]?.dayEndsAt ?? new Date()
        const windows: { block: BlockName; dueFrom: Date; dueUntil: Date; dayEndsAt: Date }[] =
          isTodayLead
            ? todayWindows(new Date(changedAt!), dayEndsAt).map((w, i) => ({
                // The block label still drives the UI grouping, so each
                // relative window is tagged with the block it falls inside.
                block: blockFor(w.dueFrom, blockWins),
                dueFrom: w.dueFrom,
                dueUntil: w.dueUntil,
                dayEndsAt,
              }))
            : blockWins

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
            } else if (existing.status === 'pending' || existing.status === 'buffered') {
              /* Buffered rows are refreshed too. They are sitting in a rep's
                 list unanswered, so a stage move or a new priority still
                 applies — and when the ladder changed, the seven Contract
                 Sent rows already buffered kept the old rank and sorted below
                 where they belonged. `leased` is deliberately excluded: a rep
                 is mid-call on those. */
              /* stage_changed_at is what the queue orders on, and it was only
                 ever written on INSERT. Every row that existed before the
                 column did — which was almost the whole queue — kept a null
                 and could never rank by recency, so the ordering was inert
                 for 3,132 of 3,180 leads. Refresh it here too, and not only
                 when the stage name changes: a lead can re-enter No Response
                 with the same name and a new timestamp. */
              const freshStage = hasStageChangedAt
                ? (opp.lastStageChangeAt ?? opp.updatedAt ?? null)
                : null
              const stageMoved = existing.stage_name !== stage.name || existing.priority !== priority
              const tsMoved = hasStageChangedAt
                && freshStage
                && (existing as any).stage_changed_at !== freshStage
              if (stageMoved || tsMoved) {
                toUpdate.push({
                  id: existing.id, stage_name: stage.name, stage_id: stage.id, priority,
                  stage_changed_at: freshStage,
                })
                updated++
              }
            }
            continue
          }

          /* The same contact can sit in two in-scope stages at once — 60 of
             them do today, mostly a lead present in both the English and the
             Spanish LHP pipeline. Each stage sweep would queue its own row
             with the same (contact, day, attempt) key, which the unique index
             rejects. existingMap only knows what is already in the database,
             so the run has to remember what it has queued for itself. */
          if (queuedKeys.has(key)) continue
          queuedKeys.add(key)

          const row: Record<string, any> = {
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
            lang:               pipeline.lang,
          }
          if (hasStageChangedAt) {
            row.stage_changed_at = opp.lastStageChangeAt ?? opp.updatedAt ?? null
          }
          toInsert.push(row)
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

  /* Insert in chunks, and check the result.

     A multi-row insert is one statement: a single unique violation rolls back
     the whole chunk. That silently cost most of the queue — 3,100 attempts
     were built and 775 landed, with the sync still reporting success. The
     error is now surfaced, and a failed chunk is retried row by row so one bad
     row costs one lead instead of five hundred. */
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500)
    const { error } = await db.from('dialer_attempts').insert(chunk)
    if (!error) { inserted += chunk.length; continue }

    console.error(`[sync] chunk of ${chunk.length} failed (${error.code}: ${error.message}) — retrying individually`)
    for (const row of chunk) {
      const { error: rowErr } = await db.from('dialer_attempts').insert(row)
      if (rowErr) {
        // A duplicate here is expected and harmless; anything else is not.
        if (rowErr.code !== '23505') console.error('[sync] row insert failed', rowErr.code, rowErr.message, row.contact_id)
      } else inserted++
    }
  }
  if (inserted !== toInsert.length) {
    console.warn(`[sync] ${toInsert.length - inserted} of ${toInsert.length} attempts did not insert`)
  }
  created = inserted

  // Batch stage/priority updates for pending rows
  /* Grouped by the whole payload, timestamp included, so rows sharing a value
     still go in one statement. Leads that changed stage in the same sync tend
     to share a timestamp, so this stays a handful of requests rather than one
     per row. */
  type UpdateGroup = { stage_name: string; stage_id: string; priority: number; stage_changed_at: string | null; ids: string[] }
  const updateGroups = new Map<string, UpdateGroup>()
  for (const u of toUpdate) {
    const k = `${u.stage_name}:${u.stage_id}:${u.priority}:${u.stage_changed_at ?? ''}`
    if (!updateGroups.has(k)) updateGroups.set(k, {
      stage_name: u.stage_name, stage_id: u.stage_id, priority: u.priority,
      stage_changed_at: u.stage_changed_at, ids: [],
    })
    updateGroups.get(k)!.ids.push(u.id)
  }
  for (const g of updateGroups.values()) {
    await db.from('dialer_attempts')
      .update({
        stage_name: g.stage_name, stage_id: g.stage_id, priority: g.priority, updated_at: now,
        ...(g.stage_changed_at ? { stage_changed_at: g.stage_changed_at } : {}),
      })
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

  /* Cancel pending attempts for leads no longer in any included stage.

     This is the most destructive thing the sync does and it infers deletion
     from absence, so it only runs when the sweep is known to be whole. A
     partial sweep means "GHL did not answer", not "these leads are gone" —
     and with the sync moved from daily to every ten minutes, one truncated
     run emptied an entire day's queue: 3,206 of 3,328 attempts cancelled,
     leaving the floor with nothing to call.

     The read is paged for the same reason the admin list had to be: a plain
     select stops at 1000 rows, so this silently saw a fraction of the day. */
  if (sweepIncomplete) {
    console.warn('[queue:sync] sweep incomplete — skipping cancellation entirely')
  } else {
    const pendingAttempts: { id: string; contact_id: string }[] = []
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await db.from('dialer_attempts')
        .select('id, contact_id')
        .eq('plan_date', today)
        .eq('status', 'pending')
        .eq('is_callback', false)
        .range(from, from + 999)
      if (!data?.length) break
      pendingAttempts.push(...data)
      if (data.length < 1000) break
    }
    const toCancel = pendingAttempts.filter(a => !seenContactIds.has(a.contact_id))

    /* A sweep that returned nothing, or that would cancel nearly everything,
       is far more likely to be broken than to mean the pipeline emptied. */
    const share = pendingAttempts.length > 0 ? toCancel.length / pendingAttempts.length : 0
    if (seenContactIds.size === 0 || (share > 0.5 && pendingAttempts.length > 50)) {
      console.error('[queue:sync] refusing to cancel %d of %d pending (%d%%) — seen=%d; this looks like a failed sweep',
        toCancel.length, pendingAttempts.length, Math.round(share * 100), seenContactIds.size)
    } else if (toCancel.length > 0) {
      for (let i = 0; i < toCancel.length; i += 500) {
        await db.from('dialer_attempts')
          .update({ status: 'cancelled', updated_at: now })
          .in('id', toCancel.slice(i, i + 500).map(a => a.id))
      }
      cancelled += toCancel.length
    }
  }

  // Re-fill all READY reps so new leads are assigned contiguously
  await fillAllReadyReps(5).catch(console.error)

  return { created, updated, cancelled, skipped }
}

// ─── State filter ─────────────────────────────────────────────────────────────
// Admins can restrict the floor to a set of states (dialer_queue_settings).
// Enforced at serve time, so a change takes effect on the next buffer fill —
// no re-sync needed. Callbacks bypass it: the rep already promised that call.

export interface StateFilter {
  mode:   'off' | 'include' | 'exclude'
  states: string[]
}

export const NO_STATE_FILTER: StateFilter = { mode: 'off', states: [] }

export async function getStateFilter(): Promise<StateFilter> {
  const db = supabaseAdmin()
  const { data, error } = await db.from('dialer_queue_settings')
    .select('state_filter_mode, state_filter_list')
    .eq('id', 1)
    .maybeSingle()
  // Table missing (migration not run) or no row → no filtering.
  if (error || !data) return NO_STATE_FILTER
  const states = (data.state_filter_list ?? []).map((s: string) => s.toUpperCase())
  const mode   = (data.state_filter_mode ?? 'off') as StateFilter['mode']
  if (mode === 'off' || states.length === 0) return NO_STATE_FILTER
  return { mode, states }
}

// Does this lead's phone pass the filter?
// Unknown state (unmapped area code) is kept on exclude, dropped on include —
// "only call CA" shouldn't leak leads we can't place.
/* A lead's state is the firm's state, not the phone's.

   This used to read the area code, which answers a different question: where
   the number was issued, not where the client is. Of today's queue it
   disagreed with the firm on 101 leads and could not classify 19 more — a
   Fears client in Texas carrying a New York mobile was filtered out as a New
   Yorker. Every firm we dial for operates in exactly one state, and that is
   the fact worth filtering on. */
export const FIRM_STATE: Record<string, string> = {
  lhp:         'CA',
  lhp_spanish: 'CA',
  jm:          'CA',
  fears:       'TX',
  fl:          'TX',
}

export function stateForLead(lead: { firm?: string | null }): string | null {
  return FIRM_STATE[String(lead.firm ?? '').toLowerCase()] ?? null
}

export function passesStateFilter(lead: { firm?: string | null }, filter: StateFilter): boolean {
  if (filter.mode === 'off' || filter.states.length === 0) return true
  const state = stateForLead(lead)
  // A firm we have no state for is kept on exclude and dropped on include —
  // "only call CA" must not leak a client we cannot place.
  if (!state) return filter.mode === 'exclude'
  return filter.mode === 'include'
    ?  filter.states.includes(state)
    : !filter.states.includes(state)
}

/* ── Firm filter ────────────────────────────────────────────────────────────
   The same mechanism on a different axis: which clients the floor is dialling
   at all. A firm is not a state — Fears is Texas, but LHP and J&M both run
   Texas numbers too — so excluding a state cannot stand in for pausing a
   client, and pausing a client cannot stand in for excluding a state. Both
   filters apply, and a lead has to pass both.

   Enforced at serve time like the state filter, so pausing a firm takes
   effect on the next buffer fill and un-pausing restores its leads with no
   re-sync. Callbacks are exempt: a rep already promised that call, and the
   client relationship is not the lead's problem. */

export interface FirmFilter {
  mode:  'off' | 'include' | 'exclude'
  firms: string[]
}

export const NO_FIRM_FILTER: FirmFilter = { mode: 'off', firms: [] }

export async function getFirmFilter(): Promise<FirmFilter> {
  const db = supabaseAdmin()
  const { data, error } = await db.from('dialer_queue_settings')
    .select('firm_filter_mode, firm_filter_list')
    .eq('id', 1)
    .maybeSingle()
  // Table or columns missing (migration not run) → no filtering.
  if (error || !data) return NO_FIRM_FILTER
  const firms = (data.firm_filter_list ?? []).map((f: string) => f.toLowerCase())
  const mode  = (data.firm_filter_mode ?? 'off') as FirmFilter['mode']
  if (mode === 'off' || firms.length === 0) return NO_FIRM_FILTER
  return { mode, firms }
}

/** Firm comes off the attempt row, so there is no unknown case to resolve. */
export function passesFirmFilter(firm: string | null | undefined, filter: FirmFilter): boolean {
  if (filter.mode === 'off' || filter.firms.length === 0) return true
  const f = (firm ?? '').toLowerCase()
  return filter.mode === 'include'
    ?  filter.firms.includes(f)
    : !filter.firms.includes(f)
}

// ─── Buffer management ────────────────────────────────────────────────────────

// Fill rep's buffer to `count`.
// Replaces the Postgres RPC — does selection in TS so we can call it
// at any time (the RPC had a due_from <= now() gate that blocked pre-loading).
// Concurrency guard: UPDATE ... WHERE status='pending' ensures only one rep
// wins if two requests race for the same lead.
/* ── Candidate selection ──────────────────────────────────────────────────
   Shared by the single-rep and all-reps fills so the two can never order the
   queue differently.

   The ordering used to be fully static — priority, then attempt number, then
   created_at — with nothing in it that changed when a lead was called. So the
   same contacts surfaced at the top of every fill, in the same sequence, and
   a lead dialed five minutes ago outranked one nobody had touched in a week.
   Reps worked the same list over and over while the tail was never reached.

   Recency is now part of the sort: within a priority tier, leads nobody has
   called come first, then the ones dialed longest ago. A contact dialed within
   the last MIN_REDIAL_GAP is held back entirely, which also stops the
   due-gate fallback from serving attempt 2 minutes after attempt 1.         */

/** A contact is never dialed twice inside this window, whatever the blocks
 *  say. Blocks are three hours wide, so this only bites when the due gate has
 *  been bypassed because no block is currently open. */
const MIN_REDIAL_GAP_MS = 90 * 60 * 1000

/** PostgREST caps a response at 1000 rows. The candidate pool has to be the
 *  whole pending set — truncating it silently pins the queue to the same head. */
async function fetchAllPending(buildQuery: () => any, maxRows = 6000): Promise<Attempt[]> {
  const out: Attempt[] = []
  for (let from = 0; from < maxRows; from += 1000) {
    const { data, error } = await buildQuery().range(from, from + 999)
    if (error) {
      console.error('[queue] pending fetch error', error)
      break
    }
    if (!data?.length) break
    out.push(...(data as Attempt[]))
    if (data.length < 1000) break
  }
  return out
}

/** Which named block a relative window falls inside, for display only. */
function blockFor(at: Date, wins: { block: BlockName; dueFrom: Date; dueUntil: Date }[]): BlockName {
  for (const w of wins) if (at >= w.dueFrom && at < w.dueUntil) return w.block
  return at < (wins[0]?.dueFrom ?? at) ? (wins[0]?.block ?? 'morning') : (wins[wins.length - 1]?.block ?? 'night')
}

/** contact_id → epoch ms of the last dial, for the contacts in play. */
async function loadLastDialed(db: any, contactIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (let i = 0; i < contactIds.length; i += 300) {
    const { data } = await db.from('dialer_lead_state')
      .select('contact_id, last_dialed_at')
      .in('contact_id', contactIds.slice(i, i + 300))
    for (const row of data ?? []) {
      if (row.last_dialed_at) map.set(row.contact_id, Date.parse(row.last_dialed_at))
    }
  }
  return map
}

/** When a lead reached its current stage — the only honest recency signal we
 *  have. `created_at` is when the sync wrote the row, which for a lead still
 *  sitting pending from July says nothing about how fresh the lead is. */
function stageChangedMs(a: Attempt): number {
  const raw = (a as any).stage_changed_at
  const t = raw ? Date.parse(raw) : NaN
  return Number.isFinite(t) ? t : 0
}

/** Did this lead arrive today, in Eastern? Speed to lead is the whole game:
 *  a lead that came in this morning is worth more than anything from last
 *  week, whatever stage it sits in. */
function arrivedToday(a: Attempt, todayEt: string): boolean {
  const ms = stageChangedMs(a)
  if (!ms) return false
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayEt
}

/* The rank a row is worked at. First match wins, which is what makes the
   ladder behave: a chase lead that arrived today ranks as chase, because
   chase sits above the today tier; a no-response that arrived today ranks as
   today, because today sits above no-response.

     appointment scheduled   600
     mia                     550
     contract sent           500
     chase                   400
     arrived today           300   <- any stage
     follow up required      200
     no response             100
*/
function rankOf(a: Attempt, todayEt: string): number {
  const stage = String(a.stage_name ?? '').toLowerCase()

  /* "Appointment scheduled (at that time)" — the qualifier is the point. It
     tops the ladder inside its slot; outside it, the slot was missed and it
     is worked like a follow-up. Without this every appointment in the
     pipeline sat above every contract sent for the whole day. */
  if (stage === 'appointment scheduled') {
    return inWindow(a.due_from ?? null, (a as any).due_until ?? null)
      ? stagePriority(stage)
      : APPOINTMENT_MISSED_RANK
  }

  const byStage = stagePriority(stage)
  // Anything ranked above the today tier keeps its stage rank outright.
  if (byStage > TODAY_RANK) return byStage
  return arrivedToday(a, todayEt) ? TODAY_RANK : byStage
}

/* Ordering, most significant first:

     1. callbacks        — a promise made to a lead at a stated time
     2. carryover        — owed from yesterday
     3. the ladder above
     4. newest first     — within a rank, latest to oldest

   Never-dialed-before-dialed sits underneath recency rather than above it,
   and MIN_REDIAL_GAP_MS still stops the same contact coming round twice in
   quick succession, so recency-first cannot turn into redial spam. */
function orderByRecency(rows: Attempt[], lastDialed: Map<string, number>): Attempt[] {
  const bool = (v: unknown) => (v ? 1 : 0)
  const todayEt = todayEastern()
  return [...rows].sort((a, b) => {
    const aDialed = lastDialed.get(a.contact_id)
    const bDialed = lastDialed.get(b.contact_id)
    return (
      bool(b.is_callback) - bool(a.is_callback) ||
      bool((b as any).is_carryover) - bool((a as any).is_carryover) ||
      rankOf(b, todayEt) - rankOf(a, todayEt) ||
      // Latest to oldest — the floor works the freshest lead in the stage next
      stageChangedMs(b) - stageChangedMs(a) ||
      // Only then: anyone never called outranks someone already tried
      (aDialed === undefined ? 0 : 1) - (bDialed === undefined ? 0 : 1) ||
      (aDialed ?? 0) - (bDialed ?? 0) ||
      (a.attempt_number ?? 0) - (b.attempt_number ?? 0) ||
      String(a.due_from ?? '').localeCompare(String(b.due_from ?? '')) ||
      // Newest row first as the final tiebreak, matching the rule above
      String((b as any).created_at ?? '').localeCompare(String((a as any).created_at ?? '')) ||
      String(a.id).localeCompare(String(b.id))
    )
  })
}

/** Called too recently to call again — callbacks excepted, they are promises. */
function dialedTooRecently(a: Attempt, lastDialed: Map<string, number>, now: number): boolean {
  if (a.is_callback) return false
  const last = lastDialed.get(a.contact_id)
  return last !== undefined && now - last < MIN_REDIAL_GAP_MS
}

export async function fillBuffer(repIdentity: string, count = 5): Promise<Attempt[]> {
  // Same cap as the all-reps path — this one can overfill too when it races.
  await enforceBufferCap(count).catch(err => console.error('[queue:cap]', err))

  const db    = supabaseAdmin()
  const today = todayEastern()
  const now   = new Date()

  // Whitelist: only active REP users can receive leads
  const { data: user } = await db.from('dialer_users')
    .select('role, active, spanish')
    .eq('twilio_identity', repIdentity)
    .maybeSingle()
  if (!user || user.role !== 'REP' || !user.active) return []
  const repSpeaksSpanish = user.spanish === true

  const stateFilter = await getStateFilter()
  const firmFilter  = await getFirmFilter()

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

  // Query pending leads — prefer those whose time block is open (due_from <= now)
  // to prevent cycling the same lead through all 3 attempts back-to-back.
  // Fallback: if NO leads are due (current block exhausted), serve next block.
  const { error: colErr } = await db.from('dialer_attempts').select('stage_changed_at').limit(0)
  const hasStageCol = !colErr

  /* The block/window is a scheduling hint, not a gate. It used to filter what
     could be served, which left the floor idle in front of a full queue
     whenever the next block had not opened yet. The ladder decides order; the
     window no longer decides eligibility. */
  function buildPendingQuery(_useDueGate: boolean) {
    let q2 = db.from('dialer_attempts')
      .select('*')
      .eq('status', 'pending')
      .eq('plan_date', today)
    q2 = q2.order('is_callback',  { ascending: false })
      .order('is_carryover',      { ascending: false })
      .order('priority',          { ascending: false })
    if (hasStageCol) q2 = q2.order('stage_changed_at', { ascending: false, nullsFirst: false })
    return q2.order('attempt_number', { ascending: true })
      .order('due_from',          { ascending: true })
      /* Newest first, matching orderByRecency. The JS sort is authoritative,
         but this order decides WHICH rows survive the 6000-row fetch cap —
         ascending here would hand the sorter the oldest leads and throw away
         exactly the fresh ones it is supposed to put on top. */
      .order('created_at',        { ascending: false })
      .order('id',                { ascending: true })
  }

  let pending = await fetchAllPending(() => buildPendingQuery(true))
  if (!pending.length) {
    // Current block exhausted — fall back to all pending (next block)
    pending = await fetchAllPending(() => buildPendingQuery(false))
  }

  if (!pending.length) return []

  // Order by how long each lead has waited since its last dial, not by the
  // static keys alone — otherwise every fill hands back the same head.
  const lastDialed = await loadLastDialed(db, [...new Set(pending.map(a => a.contact_id))])
  pending = orderByRecency(pending, lastDialed)

  // Sequential constraint: only serve attempt N if all earlier attempts are done
  const pendingByContact = new Map<string, number[]>()
  for (const a of pending as Attempt[]) {
    if (!a.is_callback) {
      const arr = pendingByContact.get(a.contact_id) ?? []
      arr.push(a.attempt_number)
      pendingByContact.set(a.contact_id, arr)
    }
  }

  // Filter: active contacts + sequential constraint + callback ownership + language (preserving DB order)
  const eligible = (pending as Attempt[]).filter(a => {
    if (activeConts.has(a.contact_id)) return false
    // Callbacks are exclusive to their owner rep — don't assign to anyone else
    if (a.is_callback && a.owner_rep && a.owner_rep !== repIdentity) return false
    // Spanish leads only go to Spanish-capable reps
    if (a.lang === 'es' && !repSpeaksSpanish) return false
    // State filter — callbacks are exempt (already promised to the lead)
    if (!a.is_callback && !passesStateFilter(a, stateFilter)) return false
    // Firm filter — callbacks exempt for the same reason
    if (!a.is_callback && !passesFirmFilter(a.firm, firmFilter)) return false
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
  // An appointment that just came due outranks anything sitting in a buffer.
  await preemptForDueAppointments().catch(err => console.error('[queue:preempt]', err))

  const db    = supabaseAdmin()
  const today = todayEastern()
  const now   = new Date()

  // Get READY reps — whitelist: ONLY users in dialer_users with role=REP
  // This excludes ADMIN users AND phantom identities like "agent" that aren't real users
  const [{ data: repStatuses }, { data: users }] = await Promise.all([
    db.from('dialer_rep_status').select('rep_identity, status').eq('status', 'READY'),
    db.from('dialer_users').select('twilio_identity, role, active, spanish'),
  ])
  const validRepIds = new Set(
    (users ?? []).filter(u => u.role === 'REP' && u.active).map(u => u.twilio_identity)
  )
  const spanishReps = new Set(
    (users ?? []).filter(u => u.role === 'REP' && u.active && u.spanish).map(u => u.twilio_identity)
  )
  const readyReps = (repStatuses ?? [])
    .map(r => r.rep_identity)
    .filter(id => validRepIds.has(id))
  if (readyReps.length === 0) return {}

  const stateFilter = await getStateFilter()
  const firmFilter  = await getFirmFilter()

  /* Release buffers held by anyone who should not be holding them.

     Two cases, and the second is the one that bit: an identity that is not a
     real rep (admin, agent), and a rep who is no longer READY. releaseBuffer
     runs when a rep changes status, but if that call is missed — a dropped
     request, a crashed tab, a status written straight to the table — the
     leads stay locked to someone who is offline. They are then invisible to
     everyone else, because a contact already buffered is excluded from every
     other rep's fill. One rep went offline still holding seven leads and the
     top of the queue could not be served to anybody.

     Reconciling here means the floor recovers on the next fill no matter how
     the status changed. */
  const readySet = new Set(readyReps)
  const { data: allBuffered } = await db.from('dialer_attempts')
    .select('id, buffered_for')
    .eq('plan_date', today)
    .eq('status', 'buffered')
  const invalidIds = (allBuffered ?? [])
    .filter(a => a.buffered_for && (!validRepIds.has(a.buffered_for) || !readySet.has(a.buffered_for)))
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

  // Prefer leads whose time block is open (due_from <= now).
  // Fallback: if current block is exhausted, serve next block.
  const { error: colErr2 } = await db.from('dialer_attempts').select('stage_changed_at').limit(0)
  const hasStageCol2 = !colErr2

  /* Window is a scheduling hint, not a gate — see buildPendingQuery. */
  function buildPendingQ2(_useDueGate: boolean) {
    let q2 = db.from('dialer_attempts')
      .select('*')
      .eq('status', 'pending')
      .eq('plan_date', today)
    q2 = q2.order('is_callback',  { ascending: false })
      .order('is_carryover',      { ascending: false })
      .order('priority',          { ascending: false })
    if (hasStageCol2) q2 = q2.order('stage_changed_at', { ascending: false, nullsFirst: false })
    return q2.order('attempt_number', { ascending: true })
      .order('due_from',          { ascending: true })
      .order('created_at',        { ascending: true })
      .order('id',                { ascending: true })
  }

  let pending = await fetchAllPending(() => buildPendingQ2(true))
  if (!pending.length) {
    pending = await fetchAllPending(() => buildPendingQ2(false))
  }

  if (!pending.length) return {}

  const lastDialed2 = await loadLastDialed(db, [...new Set(pending.map(a => a.contact_id))])
  pending = orderByRecency(pending, lastDialed2)

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
    // State filter — callbacks are exempt (already promised to the lead)
    if (!a.is_callback && !passesStateFilter(a, stateFilter)) return false
    // Firm filter — callbacks exempt for the same reason
    if (!a.is_callback && !passesFirmFilter(a.firm, firmFilter)) return false
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

  // Pass 2: language-aware round-robin for non-callback leads
  // Spanish leads only go to Spanish-capable reps
  const assigned = new Set<number>()
  for (const { rep } of repsNeedingLeads) {
    let left = repNeeds.get(rep) ?? 0
    const canSpanish = spanishReps.has(rep)
    for (let i = 0; i < remainingEligible.length && left > 0; i++) {
      if (assigned.has(i)) continue
      const a = remainingEligible[i]
      if (a.lang === 'es' && !canSpanish) continue
      toUpdate.push({ id: a.id, rep })
      assigned.add(i)
      left--
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

  /* Trim anything over the cap.

     The count of what a rep already holds is read at the top of this function
     and acted on at the bottom, and several things trigger a fill — the GHL
     sync, a rep changing status, a filter edit, a rep asking for their next
     lead. Two overlapping runs each saw an empty buffer and each handed out
     five, which is how one rep ended up holding nine. Rather than trying to
     make the read-then-write atomic across all those callers, the excess is
     released here: the newest buffered rows go back to pending, where they
     are picked up again on the next fill. */
  await enforceBufferCap(count)

  return result
}

/** Release anything a rep holds beyond `count`, newest first. */
export async function enforceBufferCap(count = 5): Promise<number> {
  const db    = supabaseAdmin()
  const today = todayEastern()

  const { data: held } = await db.from('dialer_attempts')
    .select('id, buffered_for, buffered_at')
    .eq('plan_date', today)
    .eq('status', 'buffered')
    .order('buffered_at', { ascending: true })
  if (!held?.length) return 0

  const { data: leased } = await db.from('dialer_attempts')
    .select('leased_by')
    .eq('plan_date', today)
    .eq('status', 'leased')
  const onCall: Record<string, number> = {}
  for (const r of leased ?? []) if (r.leased_by) onCall[r.leased_by] = (onCall[r.leased_by] ?? 0) + 1

  const byRep = new Map<string, string[]>()
  for (const r of held) {
    if (!r.buffered_for) continue
    const arr = byRep.get(r.buffered_for) ?? []
    arr.push(r.id)
    byRep.set(r.buffered_for, arr)
  }

  const excess: string[] = []
  for (const [rep, ids] of byRep) {
    const room = count - (onCall[rep] ?? 0)
    if (ids.length > room) excess.push(...ids.slice(Math.max(0, room)))
  }
  if (!excess.length) return 0

  const nowIso = new Date().toISOString()
  for (let i = 0; i < excess.length; i += 500) {
    await db.from('dialer_attempts')
      .update({ status: 'pending', buffered_for: null, buffered_at: null, updated_at: nowIso })
      .in('id', excess.slice(i, i + 500))
      .eq('status', 'buffered')
  }
  console.warn('[queue:fill] released %d lead(s) over the %d cap', excess.length, count)
  return excess.length
}

/* ═══════════════════════════════════════════════════════════════════════════
   Preemption — an appointment that reaches its time jumps the buffer.

   Ranking alone was not enough. rankOf already puts an appointment at the top
   of the ladder for exactly as long as its window is open, but the ladder is
   only consulted when a buffer is refilled. A rep holding five leads at 2:00
   would not see a 2:15 appointment until they had worked through all five,
   and by then the window had closed and the appointment was demoted to
   APPOINTMENT_MISSED_RANK — top of the queue, never served.

   So when a time-bound lead enters its window it is pushed into a rep's
   buffer, displacing that rep's lowest-ranked lead back to pending. The
   displaced lead loses nothing: it returns to the pool at its own rank and is
   picked up again on the next fill.
   ═══════════════════════════════════════════════════════════════════════════ */
export async function preemptForDueAppointments(): Promise<number> {
  const db    = supabaseAdmin()
  const today = todayEastern()
  const now   = new Date()
  const todayEt = todayEastern()

  const [{ data: pendingRows }, { data: heldRows }, { data: users }] = await Promise.all([
    db.from('dialer_attempts').select('*').eq('plan_date', today).eq('status', 'pending'),
    db.from('dialer_attempts').select('*').eq('plan_date', today).eq('status', 'buffered'),
    db.from('dialer_users').select('twilio_identity, role, active'),
  ])
  const validRepIds = new Set(
    (users ?? []).filter(u => u.role === 'REP' && u.active).map(u => u.twilio_identity)
  )

  /* Time-bound and live right now: an appointment inside its slot, or a
     callback whose promised time has come. Nothing else preempts — a
     contract sent is urgent in rank, not in clock time. */
  const isLive = (a: any) => {
    const stage = String(a.stage_name ?? '').toLowerCase()
    if (a.is_callback) return inWindow(a.due_from ?? null, a.due_until ?? null, now.getTime())
    if (stage !== 'appointment scheduled') return false
    return inWindow(a.due_from ?? null, a.due_until ?? null, now.getTime())
  }

  const held = (heldRows ?? []).filter(a => a.buffered_for && validRepIds.has(a.buffered_for))
  const activeContacts = new Set(held.map(a => a.contact_id))
  // Anything leased (on a call) is untouchable.
  const { data: leasedRows } = await db.from('dialer_attempts')
    .select('contact_id, leased_by').eq('plan_date', today).eq('status', 'leased')
  for (const r of leasedRows ?? []) activeContacts.add(r.contact_id)
  const leasedCount: Record<string, number> = {}
  for (const r of leasedRows ?? []) if (r.leased_by) leasedCount[r.leased_by] = (leasedCount[r.leased_by] ?? 0) + 1

  const due = (pendingRows ?? [])
    .filter(isLive)
    .filter(a => !activeContacts.has(a.contact_id))
    .sort((a, b) => String(a.due_from ?? '').localeCompare(String(b.due_from ?? '')))
  if (!due.length) return 0

  // A rep's buffer, worst-ranked first — that is who gets displaced.
  const byRep = new Map<string, any[]>()
  for (const a of held) {
    const arr = byRep.get(a.buffered_for) ?? []
    arr.push(a)
    byRep.set(a.buffered_for, arr)
  }
  for (const [rep, arr] of byRep) {
    arr.sort((x, y) => rankOf(x, todayEt) - rankOf(y, todayEt) ||
                       String(x.due_from ?? '').localeCompare(String(y.due_from ?? '')))
    byRep.set(rep, arr)
  }

  const reps = [...byRep.keys()]
  if (!reps.length) return 0

  let moved = 0
  for (const appt of due) {
    /* Spread across reps: the one holding the weakest lead takes it, so two
       appointments landing together do not both displace the same rep. */
    let target: string | null = null
    let victim: any = null
    for (const rep of reps) {
      const buf = byRep.get(rep) ?? []
      const capacity = 5 - (buf.length + (leasedCount[rep] ?? 0))
      if (capacity > 0) { target = rep; victim = null; break }
      const worst = buf[0]
      if (!worst) continue
      if (rankOf(worst, todayEt) >= rankOf(appt, todayEt)) continue  // nothing weaker to displace
      if (!victim || rankOf(worst, todayEt) < rankOf(victim, todayEt)) { target = rep; victim = worst }
    }
    if (!target) continue

    const nowIso = now.toISOString()
    const { data: claimed } = await db.from('dialer_attempts')
      .update({ status: 'buffered', buffered_for: target, buffered_at: nowIso, updated_at: nowIso })
      .eq('id', appt.id).eq('status', 'pending').select('id')
    if (!claimed?.length) continue

    if (victim) {
      await db.from('dialer_attempts')
        .update({ status: 'pending', buffered_for: null, buffered_at: null, updated_at: nowIso })
        .eq('id', victim.id).eq('status', 'buffered')
      const buf = (byRep.get(target) ?? []).filter(x => x.id !== victim.id)
      byRep.set(target, buf)
    }
    const buf = byRep.get(target) ?? []
    buf.push(appt)
    buf.sort((x, y) => rankOf(x, todayEt) - rankOf(y, todayEt))
    byRep.set(target, buf)
    activeContacts.add(appt.contact_id)
    moved++
  }

  if (moved) console.log('[queue:preempt] %d time-bound lead(s) pushed into buffers', moved)
  return moved
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

  // ── Stamp disposition on dialer_calls for the most recent call ─────────
  if (attempt.contact_id) {
    const { data: recentCall } = await db.from('dialer_calls')
      .select('call_sid')
      .eq('contact_id', attempt.contact_id)
      .eq('rep_identity', opts.repIdentity)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (recentCall) {
      await db.from('dialer_calls').update({
        disposition,
        nq_reason: opts.nqReason?.trim() || null,
      }).eq('call_sid', recentCall.call_sid)
    }
  }

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
      // Cancel remaining attempts today
      await cancelRemainingAttempts(attempt.contact_id, today, attemptId, db)

      const cbAt = opts.callbackAt ? new Date(opts.callbackAt) : new Date(now.getTime() + 4 * 3600 * 1000)

      // Determine owner (the owner who scheduled it, or this rep)
      const { data: ls } = await db.from('dialer_lead_state')
        .select('owner_rep').eq('contact_id', attempt.contact_id).maybeSingle()
      const callbackOwner = ls?.owner_rep ?? opts.repIdentity

      // Add to dialer_callbacks (rep manually calls from Callbacks page)
      await db.from('dialer_callbacks').insert({
        contact_id:       attempt.contact_id,
        contact_name:     attempt.contact_name,
        phone:            attempt.phone,
        firm:             attempt.firm,
        stage_name:       attempt.stage_name,
        callback_at:      cbAt.toISOString(),
        callback_context: opts.callbackContext ?? null,
        source:           'disposition',
        owner_rep:        callbackOwner,
      })
      break
    }

    // Terminal: remove from calling pool
    case 'Qualified':
    case 'Signed':
    case 'MIA Reconnected':
      await cancelRemainingAttempts(attempt.contact_id, today, attemptId, db)
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

  // ── Persist caller ID when the lead actually answered ──────────────────────
  if (disposition !== 'No Answer' && attempt.contact_id) {
    const { data: call } = await db.from('dialer_calls')
      .select('caller_id_used')
      .eq('contact_id', attempt.contact_id)
      .eq('rep_identity', opts.repIdentity)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (call?.caller_id_used) {
      await db.from('dialer_lead_state')
        .update({ assigned_caller_id: call.caller_id_used, updated_at: now.toISOString() })
        .eq('contact_id', attempt.contact_id)
    }
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
    'Not Qualified':    'Not Qualified',
    'Qualified':        'Chase',
    'Callback':         'Follow Up Required',
    'Signed':           'Signed/Sent',
    'No Answer':        'No Response',
    'MIA Reconnected':  'Signed/Sent',
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
      'Qualified':        'lhp - c',
      'Not Qualified':    'lhp - nq',
      'Callback':         'lhp - ap',
      'No Answer':        'lhp - nr',
      'Signed':           'lhp - ps',
      'MIA Reconnected':  'lhp - ps',
    },
    fears: {
      'Qualified':        'fl - c',
      'Not Qualified':    'fl - nq',
      'Callback':         'fl - ap',
      'No Answer':        'fl - nr',
      'Signed':           'fl - ps',
      'MIA Reconnected':  'fl - ps',
    },
    jm: {
      'Qualified':        'jm - c',
      'Not Qualified':    'jm - nq',
      'Callback':         'jm - ap',
      'No Answer':        'jm - nr',
      'Signed':           'jm - ps',
      'MIA Reconnected':  'jm - ps',
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
  if (['Callback', 'Qualified', 'Not Qualified', 'Signed', 'MIA Reconnected'].includes(disposition) && attempt.contact_id) {
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
      const prefix = firm === 'lhp' ? 'lhp' : firm === 'jm' ? 'jm' : 'fl'
      const reasonTag = `${prefix} - nq - ${opts.nqReason}`
      await tagGHLContact(attempt.contact_id, [reasonTag]).catch(console.error)
    }

    // Slack notification for NQ disposition
    const nqWebhook = (process.env.SLACK_NQ_WEBHOOK || '').trim().replace(/\\n$/, '')
    if (nqWebhook) {
      const firmLabel = firm === 'lhp' ? 'LHP' : firm === 'fears' ? 'Fears' : firm.toUpperCase()
      await fetch(nqWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Not Qualified — ${attempt.contact_name} (${firmLabel})${opts.nqReason ? ` — Reason: ${opts.nqReason}` : ''}`,
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

  // ── Schedule auto intake-fill 1 hour after Signed/MIA Reconnected ────────
  if (['Signed', 'MIA Reconnected'].includes(disposition) && attempt.contact_id) {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now
    try {
      await db.from('intake_fill_jobs').upsert({
        contact_id:   attempt.contact_id,
        contact_name: attempt.contact_name,
        firm:         firm || null,
        status:       'pending',
        scheduled_at: scheduledAt,
        created_at:   now.toISOString(),
      }, { onConflict: 'contact_id' })
    } catch (err) {
      console.error('[disposition] Failed to schedule intake fill', err)
    }
    console.log('[disposition] Scheduled intake fill for', {
      contactId: attempt.contact_id,
      scheduledAt,
    })
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
    .eq('is_callback', false)
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
    .eq('is_callback', false)
}

// ─── GHL helpers ─────────────────────────────────────────────────────────────

async function moveGHLStage(opportunityId: string, pipelineId: string, targetStageName: string) {
  const headers = ghlHeaders()
  // Cached schema read. This used to pull the entire location-wide pipeline
  // list on EVERY disposition — two GHL calls per rep action, one of which
  // belongs in cache.
  let allPipelines
  try {
    allPipelines = await getPipelines()
  } catch (err) {
    console.error('[moveGHLStage] Failed to fetch pipelines', err)
    return
  }
  const pipeline = allPipelines.find((p) => p.id === pipelineId)
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
