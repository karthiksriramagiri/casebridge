import { createClient } from '@supabase/supabase-js'

export interface QueueItem {
  id:                string
  contact_id:        string
  contact_name:      string
  phone:             string
  firm:              string
  pipeline_id:       string
  stage_id:          string
  stage_name:        string
  timezone:          string
  ghl_opportunity_id: string | null
  owner_rep_identity: string | null
  priority:          number
  next_attempt_at:   string
  attempt_count:      number
  calls_today:       number
  calls_today_date:  string | null
  callback_at:       string | null
  callback_for_rep:  string | null
  callback_context:  string | null
  locked_by:         string | null
  exhausted:         boolean
  last_disposition:  string | null
  added_at:          string
}

// How many times per day each stage should be called
const DAILY_LIMIT: Record<string, number> = {
  'contract sent':         4,
  'chase':                 4,
  'follow up required':    4,
  'no response':           4,
  'appointment scheduled': 1, // only surfaces at exact callback_at time
}

export function getDailyLimit(stageName: string): number {
  return DAILY_LIMIT[stageName.toLowerCase()] ?? 3
}


const FIRM_TIMEZONE: Record<string, string> = {
  lhp:   'America/Los_Angeles',
  fears: 'America/Chicago',
}

// Only these stages are synced into the queue. Everything else (Qualified, NQ, DNC, etc.) is ignored.
// Priority order for the daily master list.
// Lower number = worked first. Appointment Scheduled is excluded from
// the general list — it only surfaces when a specific callback_at is due.
const INCLUDED_STAGES: Record<string, { priority: number }> = {
  'contract sent':        { priority: 1 },
  'chase':                { priority: 2 },
  'follow up required':   { priority: 3 },
  'no response':          { priority: 4 },
  'appointment scheduled':{ priority: 5 }, // parked — only surfaces at callback_at
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export function isWithinCallingHours(timezone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
    const parts = formatter.formatToParts(new Date())
    const hour   = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0')
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
    const t = hour * 60 + minute
    return t >= 8 * 60 + 30 && t <= 20 * 60 + 30
  } catch {
    return true
  }
}


// Returns next N leads for a rep, prioritised:
// 1. Callbacks due for this rep
// 2. Callbacks with expired grace window (3 min), any rep
// 3. Owned leads for this rep
// 4. General pool (no owner, or owner offline)
//
// Leads are locked atomically at FETCH TIME — a lead shown in one rep's queue
// will not appear in any other rep's queue until the lock expires (90s).
export async function getNextLeads(repIdentity: string, count = 10): Promise<QueueItem[]> {
  const db  = supabaseAdmin()
  const now = new Date()

  // Clean stale locks (> 90s old)
  await db.from('dialer_queue')
    .update({ locked_by: null, locked_at: null })
    .lt('locked_at', new Date(now.getTime() - 90 * 1000).toISOString())
    .not('locked_by', 'is', null)

  // Who's online (any active status) — used to detect owner presence.
  const { data: onlineRows } = await db.from('dialer_rep_status')
    .select('rep_identity, status')
    .in('status', ['READY', 'ON_CALL', 'WRAPUP', 'PAUSED'])
  const onlineSet = new Set((onlineRows ?? []).map((r: any) => r.rep_identity as string))

  // Round-robin pool: only READY reps receive new lead assignments.
  // Sorted alphabetically so every rep calculates the same stable ordering.
  let readyReps = (onlineRows ?? [])
    .filter((r: any) => r.status === 'READY')
    .map((r: any) => r.rep_identity as string)
    .sort()
  if (!readyReps.includes(repIdentity)) readyReps = [...readyReps, repIdentity].sort()
  const repCount = readyReps.length
  const repIndex = readyReps.indexOf(repIdentity)

  const todayDate = now.toISOString().split('T')[0]

  // Fetch ALL active candidates in priority order without lock filter —
  // we need the global ordering to assign leads by position.
  const { data: rows } = await db.from('dialer_queue')
    .select('*')
    .eq('exhausted', false)
    .lte('next_attempt_at', now.toISOString())
    .order('priority',       { ascending: true })
    .order('last_called_at', { ascending: true, nullsFirst: true })
    .limit(2000)

  const allCandidates = (rows ?? [] as QueueItem[]).filter((lead: QueueItem) => {
    const limit = getDailyLimit(lead.stage_name)
    const callsToday = lead.calls_today_date === todayDate ? lead.calls_today : 0
    return callsToday < limit
  }) as QueueItem[]

  const result: QueueItem[] = []
  const added  = new Set<string>()
  const graceExpiry = new Date(now.getTime() - 3 * 60 * 1000)

  // Atomically acquire lock. Returns true only if this rep now holds it.
  async function tryLock(lead: QueueItem): Promise<boolean> {
    const { count: affected } = await db.from('dialer_queue')
      .update({ locked_by: repIdentity, locked_at: now.toISOString() }, { count: 'exact' })
      .eq('id', lead.id)
      .or(`locked_by.is.null,locked_by.eq.${repIdentity}`)
    return (affected ?? 0) > 0
  }

  // A: Callbacks specifically for this rep (always direct — skip round-robin)
  for (const lead of allCandidates) {
    if (result.length >= count) break
    if (added.has(lead.id)) continue
    if (
      lead.callback_for_rep === repIdentity &&
      lead.callback_at && new Date(lead.callback_at) <= now &&
      isWithinCallingHours(lead.timezone)
    ) {
      if (await tryLock(lead)) { result.push(lead); added.add(lead.id) }
    }
  }

  // B: Overdue callbacks (grace window expired), any rep
  for (const lead of allCandidates) {
    if (result.length >= count) break
    if (added.has(lead.id)) continue
    if (
      lead.callback_at && new Date(lead.callback_at) <= graceExpiry &&
      lead.callback_for_rep && lead.callback_for_rep !== repIdentity &&
      isWithinCallingHours(lead.timezone)
    ) {
      if (await tryLock(lead)) { result.push(lead); added.add(lead.id) }
    }
  }

  // C: Owned leads for this rep
  for (const lead of allCandidates) {
    if (result.length >= count) break
    if (added.has(lead.id)) continue
    if (
      lead.owner_rep_identity === repIdentity &&
      !lead.callback_for_rep &&
      isWithinCallingHours(lead.timezone)
    ) {
      if (await tryLock(lead)) { result.push(lead); added.add(lead.id) }
    }
  }

  // D: General pool — true round-robin by global position.
  // Lead at position i (0-based) in the ordered list is assigned to rep (i % repCount).
  // e.g. 3 reps: rep0 gets positions 0,3,6,9… rep1 gets 1,4,7,10… rep2 gets 2,5,8,11…
  let poolIdx = 0
  for (const lead of allCandidates) {
    if (result.length >= count) break
    if (added.has(lead.id)) continue
    if (lead.callback_for_rep) { poolIdx++; continue }
    const ownerOnline = lead.owner_rep_identity && onlineSet.has(lead.owner_rep_identity)
    if (ownerOnline) { poolIdx++; continue }
    if (!isWithinCallingHours(lead.timezone)) { poolIdx++; continue }

    if (poolIdx % repCount === repIndex) {
      if (await tryLock(lead)) { result.push(lead); added.add(lead.id) }
    }
    poolIdx++
  }

  return result
}

export async function lockQueueItem(queueId: string, repIdentity: string) {
  const db = supabaseAdmin()
  // Allow refresh if already locked by this rep (preview lock → call lock)
  await db.from('dialer_queue')
    .update({ locked_by: repIdentity, locked_at: new Date().toISOString() })
    .eq('id', queueId)
    .or(`locked_by.is.null,locked_by.eq.${repIdentity}`)
}

export async function unlockQueueItem(queueId: string) {
  const db = supabaseAdmin()
  await db.from('dialer_queue')
    .update({ locked_by: null, locked_at: null })
    .eq('id', queueId)
}

export interface DispositionOptions {
  repIdentity:     string
  callDuration:    number
  callbackAt?:     string
  callbackContext?: string
  nqReason?:       string
}

export async function applyDisposition(
  queueId:     string,
  disposition: string,
  opts:        DispositionOptions,
) {
  const db  = supabaseAdmin()
  const now = new Date()

  const { data: item } = await db.from('dialer_queue')
    .select('*').eq('id', queueId).single()
  if (!item) return

  const isRealConversation = opts.callDuration > 30 &&
    !['No Answer', 'Voicemail Left', 'Wrong Number'].includes(disposition)

  const todayDate = now.toISOString().split('T')[0]
  const callsToday = item.calls_today_date === todayDate ? (item.calls_today ?? 0) : 0

  const updates: Record<string, any> = {
    locked_by:        null,
    locked_at:        null,
    last_called_at:   now.toISOString(),
    last_disposition: disposition,
    updated_at:       now.toISOString(),
    attempt_count:    (item.attempt_count ?? 0) + 1,
    calls_today:      callsToday + 1,
    calls_today_date: todayDate,
  }

  // Assign ownership on first real conversation
  if (isRealConversation && !item.owner_rep_identity) {
    updates.owner_rep_identity = opts.repIdentity
  }

  switch (disposition) {
    case 'No Answer':
    case 'Voicemail Left': {
      // Re-queue immediately — lead goes to back of its priority bucket
      // (ordering by last_called_at means freshly-called leads surface last).
      // Daily limit (calls_today) caps how many times per day the lead is called.
      updates.callback_at      = null
      updates.callback_for_rep = null
      updates.next_attempt_at  = now.toISOString()
      break
    }

    case 'Callback': {
      const cbAt = opts.callbackAt ? new Date(opts.callbackAt) : new Date(now.getTime() + 24 * 60 * 60 * 1000)
      updates.callback_at      = cbAt.toISOString()
      updates.callback_for_rep = item.owner_rep_identity ?? opts.repIdentity
      updates.callback_context = opts.callbackContext ?? null
      updates.next_attempt_at  = cbAt.toISOString()
      updates.priority         = 1
      if (!item.owner_rep_identity) updates.owner_rep_identity = opts.repIdentity
      break
    }

    case 'Appointment Set': {
      // Move to Appointment Scheduled in GHL. Keep in queue but only surface at callback time.
      if (opts.callbackAt) {
        const cbAt = new Date(opts.callbackAt)
        updates.callback_at      = cbAt.toISOString()
        updates.callback_for_rep = item.owner_rep_identity ?? opts.repIdentity
        updates.callback_context = 'Appointment'
        updates.next_attempt_at  = cbAt.toISOString()
        updates.priority         = 1
        if (!item.owner_rep_identity) updates.owner_rep_identity = opts.repIdentity
      } else {
        // No time provided — park it far in the future
        updates.next_attempt_at = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
      }
      break
    }

    // Terminal — remove from queue
    case 'Wrong Number':
    case 'Do Not Call':
    case 'Not Qualified':
    case 'Not Interested':
    case 'Qualified':
    case 'Attorney Review': {
      updates.exhausted    = true
      updates.exhausted_at = now.toISOString()
      break
    }

    default: {
      updates.next_attempt_at = now.toISOString()
    }
  }

  await db.from('dialer_queue').update(updates).eq('id', queueId)

  // GHL stage move
  const GHL_STAGE_MAP: Record<string, string> = {
    'Qualified':       'Qualified',
    'Not Qualified':   'Not Qualified',
    'Not Interested':  'Not Interested',
    'Appointment Set': 'Appointment Scheduled',
    'Attorney Review': 'Contract Sent',
  }
  const targetStageName = GHL_STAGE_MAP[disposition]
  if (targetStageName && item.ghl_opportunity_id) {
    await moveGHLStage(item.ghl_opportunity_id, item.pipeline_id, targetStageName).catch(console.error)
  }

  if (disposition === 'Do Not Call' && item.contact_id) {
    await tagGHLContact(item.contact_id, ['do-not-call']).catch(console.error)
  }
}

async function moveGHLStage(opportunityId: string, pipelineId: string, targetStageName: string) {
  const headers = {
    Authorization: `Bearer ${(process.env.GHL_API_KEY ?? '').trim()}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
  const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

  const pRes = await fetch(
    `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${LOCATION_ID}`,
    { headers }
  )
  if (!pRes.ok) return
  const pData = await pRes.json()
  const pipeline = (pData.pipelines ?? []).find((p: any) => p.id === pipelineId)
  if (!pipeline) return
  const stage = (pipeline.stages ?? []).find((s: any) =>
    s.name.toLowerCase() === targetStageName.toLowerCase()
  )
  if (!stage) return

  await fetch(`https://services.leadconnectorhq.com/opportunities/${opportunityId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ pipelineStageId: stage.id }),
  })
}

async function tagGHLContact(contactId: string, newTags: string[]) {
  const headers = {
    Authorization: `Bearer ${(process.env.GHL_API_KEY ?? '').trim()}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
  const cRes = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, { headers })
  if (!cRes.ok) return
  const cData = await cRes.json()
  const existing: string[] = cData.contact?.tags ?? []
  const merged = Array.from(new Set([...existing, ...newTags]))
  await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ tags: merged }),
  })
}

// Sync GHL → dialer_queue
// Only syncs the 5 specified stages. Upserts by contact_id+pipeline_id.
// Appointment Scheduled leads are parked far in the future — only callable at callback time.
export async function syncGHLToQueue(): Promise<{ inserted: number; updated: number; exhausted: number }> {
  const db = supabaseAdmin()
  const GHL_BASE    = 'https://services.leadconnectorhq.com'
  const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'
  const headers = {
    Authorization: `Bearer ${(process.env.GHL_API_KEY ?? '').trim()}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }

  const PIPELINES = [
    { id: 'yMqNixSnChC5lcGQXA1g', firm: 'lhp' },
    { id: 'Jj4DCdu5duYDgI87ERbx', firm: 'fears' },
  ]

  let inserted = 0
  let updated  = 0

  // Track every contact+pipeline combo found in included stages during this sync.
  // Anything in our queue that's NOT found here has moved to a non-included stage — exhaust it.
  const foundKeys = new Set<string>()

  for (const pipeline of PIPELINES) {
    const pRes = await fetch(`${GHL_BASE}/opportunities/pipelines?locationId=${LOCATION_ID}`, { headers })
    if (!pRes.ok) continue
    const pData = await pRes.json()
    const pl = (pData.pipelines ?? []).find((p: any) => p.id === pipeline.id)
    if (!pl) continue

    for (const stage of (pl.stages ?? [])) {
      const stageKey = stage.name.toLowerCase()
      const stageCfg = INCLUDED_STAGES[stageKey]
      if (!stageCfg) continue // skip anything not in our list

      const timezone = FIRM_TIMEZONE[pipeline.firm] ?? 'America/Los_Angeles'
      const isAppointmentStage = stageKey === 'appointment scheduled'

      // Appointment Scheduled leads park far in future — only callable via explicit callback
      const defaultNextAttempt = isAppointmentStage
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : new Date().toISOString()

      let cursor: string | null = null
      let cursorId: string | null = null

      while (true) {
        const url = new URL(`${GHL_BASE}/opportunities/search`)
        url.searchParams.set('location_id', LOCATION_ID)
        url.searchParams.set('pipeline_id', pipeline.id)
        url.searchParams.set('pipeline_stage_id', stage.id)
        url.searchParams.set('limit', '100')
        if (cursor)   url.searchParams.set('startAfter', cursor)
        if (cursorId) url.searchParams.set('startAfterId', cursorId)

        const res = await fetch(url.toString(), { headers })
        if (!res.ok) break
        const data = await res.json()
        const opps = data.opportunities ?? []
        if (opps.length === 0) break

        for (const opp of opps) {
          const contact = opp.contact ?? {}
          const phone =
            contact.phone ??
            (contact.phones?.find((p: any) => p.type === 'mobile') ?? contact.phones?.[0])?.number ??
            ''
          if (!phone || !opp.contactId) continue

          foundKeys.add(`${opp.contactId}:${pipeline.id}`)

          const { data: existing } = await db.from('dialer_queue')
            .select('id, exhausted')
            .eq('contact_id', opp.contactId)
            .eq('pipeline_id', pipeline.id)
            .maybeSingle()

          if (existing) {
            await db.from('dialer_queue').update({
              contact_name:       opp.name ?? contact.name ?? 'Unknown',
              phone,
              stage_id:           stage.id,
              stage_name:         stage.name,
              ghl_opportunity_id: opp.id,
              // If stage changed back to an active one, un-exhaust
              ...(existing.exhausted ? { exhausted: false, exhausted_at: null } : {}),
              updated_at:         new Date().toISOString(),
            }).eq('id', existing.id)
            updated++
          } else {
            await db.from('dialer_queue').insert({
              contact_id:         opp.contactId,
              contact_name:       opp.name ?? contact.name ?? 'Unknown',
              phone,
              firm:               pipeline.firm,
              pipeline_id:        pipeline.id,
              stage_id:           stage.id,
              stage_name:         stage.name,
              timezone,
              ghl_opportunity_id: opp.id,
              priority:           stageCfg.priority,
              next_attempt_at:    defaultNextAttempt,
              added_at:           opp.createdAt ?? new Date().toISOString(),
            })
            inserted++
          }
        }

        cursor   = data.meta?.startAfter   ?? null
        cursorId = data.meta?.startAfterId ?? null
        if (!cursor && !cursorId) break
      }
    }
  }

  // Exhaust any active queue items whose lead has moved out of an included stage in GHL.
  // Fetch all non-exhausted items and remove ones not seen during this sync.
  const { data: activeItems } = await db.from('dialer_queue')
    .select('id, contact_id, pipeline_id')
    .eq('exhausted', false)

  const toExhaust = (activeItems ?? [])
    .filter((row: any) => !foundKeys.has(`${row.contact_id}:${row.pipeline_id}`))
    .map((row: any) => row.id)

  if (toExhaust.length > 0) {
    await db.from('dialer_queue')
      .update({ exhausted: true, exhausted_at: new Date().toISOString(), locked_by: null, locked_at: null })
      .in('id', toExhaust)
  }

  return { inserted, updated, exhausted: toExhaust.length }
}
