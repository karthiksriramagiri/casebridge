import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GHL_API_KEY     = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

const PIPELINES: Record<string, string> = {
  lhp:       'yMqNixSnChC5lcGQXA1g',
  eisenberg: 'Yk4w3ML56ECc10PFzjpK',
  thl:       'DYtmw8WEUtGePFbEDAIZ',
  mca:       '6Ku9EwTtMFk51o7Re9x0',
  fears:     'Jj4DCdu5duYDgI87ERbx',
  levine:    'JPyMNjGGAIxUv0FWW7Cg',
}

// Known stage IDs → label
const STAGE_MAP: Record<string, 'nr' | 'fu' | 'chase'> = {
  '1175a360-9914-4ce5-906d-d89adb27c732': 'nr',   // LHP NR
  '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu',   // LHP FU
  '1a4eed62-09ea-4108-ab64-2e16930350d6': 'chase', // LHP Chase
  'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b': 'nr',   // Eisenberg NR
  'fd0f13e3-b535-471a-ac37-7dc2ca177854': 'fu',   // Eisenberg FU
  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr',   // THL NR
  '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu',   // THL FU
  '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr',   // MCA NR
  'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu',   // MCA FU
  '91ced34f-cb7b-4a03-a47d-f4ffd25fd108': 'nr',   // Fears NR
  '1d6faa32-dd4b-4258-8595-93fdd6d0c8c5': 'fu',   // Fears FU
  '8e00bca9-3318-442a-8f71-f358762878da': 'chase', // Fears Chase
  '620b4cfc-fc0c-4c2c-a490-44a6bb36a3d1': 'nr',   // Levine NR
  '0ce872eb-1757-4267-949b-cebf521b3466': 'fu',   // Levine FU
  '47301b0f-3f04-4ab7-869f-55407e63c72d': 'chase', // Levine Chase
}

export interface PipelineLead {
  contactId: string
  contactName: string
  contactPhone: string | null
  stage: 'nr' | 'fu' | 'chase'
  assignedTo: string | null
  pipeline: string
  oppCreatedAt: string | null
}

async function fetchPipelineLeads(pipelineKey: string, pipelineId: string): Promise<PipelineLead[]> {
  const leads: PipelineLead[] = []
  let url: string | null =
    `https://services.leadconnectorhq.com/opportunities/search` +
    `?location_id=${GHL_LOCATION_ID}&pipeline_id=${pipelineId}&limit=100`
  let pages = 0

  while (url && pages < 20) {
    pages++
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
      cache: 'no-store',
    })
    if (!res.ok) break
    const data: any = await res.json()

    for (const opp of (data.opportunities || [])) {
      let stage: 'nr' | 'fu' | 'chase' | undefined = STAGE_MAP[opp.pipelineStageId]
      if (!stage) {
        const sn = (opp.pipelineStage?.name || '').toLowerCase()
        if (sn.includes('chase')) stage = 'chase'
        else if (sn.includes('no response')) stage = 'nr'
        else if (sn.includes('follow up')) stage = 'fu'
      }
      if (!stage) continue

      const contactId = opp.contact?.id
      if (!contactId) continue

      leads.push({
        contactId,
        contactName: opp.contact?.name || opp.name || 'Unknown',
        contactPhone: opp.contact?.phone || null,
        stage,
        assignedTo: opp.assignedTo || null,
        pipeline: pipelineKey,
        oppCreatedAt: opp.createdAt || null,
      })
    }

    url = data.meta?.nextPageUrl || null
  }

  return leads
}

type Slot = 'morning' | 'afternoon' | 'evening' | 'overnight'

// Slot windows mapped from PST → EST (PST + 3h)
// Morning:   7AM–12PM PST  = 10AM–3PM  EST
// Afternoon: 12PM–3PM PST  = 3PM–6PM   EST
// Evening:   3PM–9PM  PST  = 6PM–12AM  EST
// Overnight: 9PM–7AM  PST  = 12AM–10AM EST (spans midnight)
function getSlot(estHour: number): { slot: Slot | null; slotEndLabel: string; nextSlotLabel: string | null } {
  if (estHour >= 0  && estHour < 10) return { slot: 'overnight', slotEndLabel: '7:00 AM PST',  nextSlotLabel: 'Morning at 7:00 AM PST' }
  if (estHour >= 10 && estHour < 15) return { slot: 'morning',   slotEndLabel: '12:00 PM PST', nextSlotLabel: 'Afternoon at 12:00 PM PST' }
  if (estHour >= 15 && estHour < 18) return { slot: 'afternoon', slotEndLabel: '3:00 PM PST',  nextSlotLabel: 'Evening at 3:00 PM PST' }
  if (estHour >= 18 && estHour < 24) return { slot: 'evening',   slotEndLabel: '9:00 PM PST',  nextSlotLabel: 'Overnight at 9:00 PM PST' }
  return { slot: null, slotEndLabel: '', nextSlotLabel: null }
}

// Shift → which slots this worker covers
const SHIFT_SLOTS: Record<string, Slot[]> = {
  morning:           ['morning'],
  afternoon:         ['afternoon'],
  evening:           ['evening'],
  overnight:         ['overnight'],
  morning_afternoon: ['morning', 'afternoon'],
  afternoon_evening: ['afternoon', 'evening'],
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch this worker's profile (shift + GHL IDs + todo_mode)
  const { data: profile } = await admin
    .from('profiles')
    .select('name, shift, ghl_user_ids, todo_mode')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // --- Call listener mode ---
  if ((profile as any).todo_mode === 'call_listener') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)
    const [casesRes, notesRes] = await Promise.all([
      admin.from('ghl_leads')
        .select('id, contact_name, qualified_at, closed_by_profile_id')
        .neq('case_status', 'replacement')
        .gte('qualified_at', cutoff.toISOString())
        .order('qualified_at', { ascending: false })
        .limit(100),
      admin.from('call_listen_notes')
        .select('case_id, notes, updated_at')
        .eq('user_id', user.id),
    ])
    const notesByCaseId = new Map((notesRes.data || []).map((n: any) => [n.case_id, n]))
    const cases = (casesRes.data || []).map((c: any) => {
      const note = notesByCaseId.get(c.id)
      return {
        id: c.id,
        contactName: c.contact_name || 'Unknown',
        qualifiedAt: c.qualified_at,
        hasNote: !!note,
        notes: note?.notes || '',
      }
    })
    return NextResponse.json({ todoMode: 'call_listener', cases })
  }

  if (!profile.shift) return NextResponse.json({ error: 'No shift assigned' }, { status: 403 })

  // Determine current EST time
  const now = new Date()
  const estHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
  ) % 24 // guard against midnight returning 24
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const { slot, slotEndLabel, nextSlotLabel } = getSlot(estHour)
  const mySlots = SHIFT_SLOTS[profile.shift] || []
  const onShift = mySlots.length > 0 && (slot ? mySlots.includes(slot) : false)

  // Fetch all pipeline leads + today's call logs + urgent tasks + all shift workers in parallel
  const [pipelineResults, callLogsRes, urgentTasksRes, allWorkersRes] = await Promise.all([
    Promise.all(
      Object.entries(PIPELINES).map(([key, id]) =>
        fetchPipelineLeads(key, id).catch(() => [] as PipelineLead[])
      )
    ),
    admin
      .from('call_logs')
      .select('contact_id, slot')
      .eq('worker_id', user.id)
      .eq('date', today),
    admin
      .from('urgent_tasks')
      .select('id, title, description, assigned_to')
      .order('created_at', { ascending: true }),
    admin
      .from('profiles')
      .select('id, name, shift, ghl_user_ids')
      .not('shift', 'is', null),
  ])

  const allLeads = pipelineResults.flat()
  const callLogs = callLogsRes.data || []

  // ── NR lead sightings: record when leads first appear (for GHL call tracking)
  const nrLeadsRaw = allLeads.filter(l => l.stage === 'nr')
  if (nrLeadsRaw.length > 0) {
    await admin.from('nr_lead_sightings').upsert(
      nrLeadsRaw.map(l => ({
        contact_id:     l.contactId,
        contact_name:   l.contactName,
        pipeline:       l.pipeline,
        opp_created_at: l.oppCreatedAt || new Date().toISOString(),
      })),
      { onConflict: 'contact_id', ignoreDuplicates: true }
    )
  }
  const allWorkers: { id: string; name: string; shift: string; ghl_user_ids: string[] }[] =
    (allWorkersRes.data || []).map((w: any) => ({
      ...w,
      ghl_user_ids: w.ghl_user_ids || [],
    }))

  // Deduplicate by contactId (keep first occurrence per contact)
  const seen = new Set<string>()
  const uniqueLeads = allLeads.filter(l => {
    if (seen.has(l.contactId)) return false
    seen.add(l.contactId)
    return true
  })

  const calledSet = new Set(callLogs.map((l: any) => `${l.contact_id}:${l.slot}`))
  const workerGhlIds = new Set<string>(profile.ghl_user_ids || [])

  // Sort NR alphabetically for consistent split across workers
  const nrLeads = uniqueLeads
    .filter(l => l.stage === 'nr')
    .sort((a, b) => a.contactName.localeCompare(b.contactName))

  const fuLeads    = uniqueLeads.filter(l => l.stage === 'fu')
  const chaseLeads = uniqueLeads.filter(l => l.stage === 'chase')

  // NR distribution: find all workers covering the current slot, sort by ID for stable ordering
  function getNrForSlot(targetSlot: Slot): PipelineLead[] {
    const slotWorkers = allWorkers
      .filter(w => (SHIFT_SLOTS[w.shift] || []).includes(targetSlot))
      .sort((a, b) => a.id.localeCompare(b.id))

    const myIndex = slotWorkers.findIndex(w => w.id === user.id)
    if (myIndex === -1) return [] // I don't cover this slot

    const n = slotWorkers.length
    if (n === 1) return nrLeads // Only worker in this slot → get all
    return nrLeads.filter((_, i) => i % n === myIndex)
  }

  // FU/Chase: only leads assigned to this worker in GHL
  const myFu    = fuLeads.filter(l => l.assignedTo && workerGhlIds.has(l.assignedTo))
  const myChase = chaseLeads.filter(l => l.assignedTo && workerGhlIds.has(l.assignedTo))

  // Remove already-called leads for the given slot
  function removeCalled(leads: PipelineLead[], targetSlot: Slot): PipelineLead[] {
    return leads.filter(l => !calledSet.has(`${l.contactId}:${targetSlot}`))
  }

  const myNr = slot ? getNrForSlot(slot) : []

  let remainingNr    = slot ? removeCalled(myNr, slot)    : []
  let remainingFu    = slot ? removeCalled(myFu, slot)    : []
  let remainingChase = slot ? removeCalled(myChase, slot) : []

  // If all leads have been called, restart from the beginning
  if (slot && remainingNr.length === 0 && remainingFu.length === 0 && remainingChase.length === 0) {
    remainingNr    = myNr
    remainingFu    = myFu
    remainingChase = myChase
  }

  const calledThisSlot = callLogs.filter((l: any) => l.slot === slot).length
  const totalThisSlot  = myNr.length + myFu.length + myChase.length

  // Per-slot performance stats for every slot this worker covers
  const slotStats: Record<string, { called: number; total: number; status: 'past' | 'current' | 'upcoming' }> = {}
  for (const s of (['morning', 'afternoon', 'evening'] as Slot[])) {
    if (!mySlots.includes(s)) continue
    const slotNr    = getNrForSlot(s)
    const total     = slotNr.length + myFu.length + myChase.length
    const called    = callLogs.filter((l: any) => l.slot === s).length
    const status    = s === slot ? 'current' : (
      (s === 'morning' && (slot === 'afternoon' || slot === 'evening')) ||
      (s === 'afternoon' && slot === 'evening')
        ? 'past' : 'upcoming'
    )
    slotStats[s] = { called, total, status }
  }

  // Filter urgent tasks for this worker
  const workerName = (profile.name || '').toLowerCase()
  const urgentTasks = (urgentTasksRes.data || []).filter((t: any) =>
    t.assigned_to === 'all' ||
    (t.assigned_to && workerName.includes(t.assigned_to.toLowerCase()))
  )

  return NextResponse.json({
    workerName: profile.name,
    shift: profile.shift,
    slot,
    slotEndLabel,
    nextSlotLabel,
    onShift,
    today,
    calledCount:  calledThisSlot,
    totalCount:   totalThisSlot,
    slotStats,
    urgentTasks,
    leads: {
      nr:    remainingNr,
      fu:    remainingFu,
      chase: remainingChase,
    },
  })
}
