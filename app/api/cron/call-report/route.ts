import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || ''

const GHL_API_KEY     = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

const PIPELINES: Record<string, string> = {
  lhp:       'yMqNixSnChC5lcGQXA1g',
  eisenberg: 'Yk4w3ML56ECc10PFzjpK',
  thl:       'DYtmw8WEUtGePFbEDAIZ',
  mca:       '6Ku9EwTtMFk51o7Re9x0',
}

const STAGE_MAP: Record<string, 'nr' | 'fu' | 'chase'> = {
  '1175a360-9914-4ce5-906d-d89adb27c732': 'nr',
  '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu',
  '1a4eed62-09ea-4108-ab64-2e16930350d6': 'chase',
  'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b': 'nr',
  'fd0f13e3-b535-471a-ac37-7dc2ca177854': 'fu',
  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr',
  '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu',
  '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr',
  'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu',
}

const WORKER_GHL_IDS: Record<string, string[]> = {
  pablo: ['DNj1g2jJWDnSObPK0CHb', 'JyJZdMlw3puzzq6nLfkN'],
  ziyad: ['Yfag4NMqX2HIaOOrXU7G'],
}

async function fetchAllLeads() {
  const results = await Promise.all(
    Object.entries(PIPELINES).map(async ([pipelineKey, pipelineId]) => {
      const leads: { contactId: string; stage: 'nr' | 'fu' | 'chase'; assignedTo: string | null }[] = []
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
          leads.push({ contactId, stage, assignedTo: opp.assignedTo || null })
        }

        url = data.meta?.nextPageUrl || null
      }
      return leads
    })
  )

  const seen = new Set<string>()
  return results.flat().filter(l => {
    if (seen.has(l.contactId)) return false
    seen.add(l.contactId)
    return true
  })
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!SLACK_WEBHOOK) {
    return NextResponse.json({ error: 'No Slack webhook configured' }, { status: 500 })
  }

  // Get today's date in EST
  const now = new Date()
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // Fetch all GHL leads for total count
  const allLeads = await fetchAllLeads()

  const nrLeads = allLeads.filter(l => l.stage === 'nr')
    .sort((a, b) => a.contactId.localeCompare(b.contactId))

  // Fetch worker profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .or('name.ilike.%pablo%,name.ilike.%ziyad%')

  const workerProfiles: Record<string, string> = {}
  for (const p of (profiles || [])) {
    const lower = (p.name || '').toLowerCase()
    if (lower.includes('pablo')) workerProfiles['pablo'] = p.id
    if (lower.includes('ziyad')) workerProfiles['ziyad'] = p.id
  }

  // Fetch today's call logs for all workers
  const { data: callLogs } = await supabase
    .from('call_logs')
    .select('contact_id, worker_id, slot')
    .eq('date', today)

  const workerSections: string[] = []

  for (const workerKey of ['ziyad', 'pablo'] as const) {
    const workerId = workerProfiles[workerKey]
    if (!workerId) continue

    const workerGhlIds = new Set(WORKER_GHL_IDS[workerKey])
    const workerLogs = (callLogs || []).filter(l => l.worker_id === workerId)
    const calledSet = new Set(workerLogs.map(l => l.contact_id))

    // Calculate total assigned leads per slot
    function getSlotNr(slot: 'morning' | 'afternoon' | 'evening') {
      if (slot === 'morning' && workerKey === 'ziyad') return nrLeads
      if (slot === 'afternoon') return nrLeads.filter((_, i) => workerKey === 'ziyad' ? i % 2 === 0 : i % 2 === 1)
      if (slot === 'evening' && workerKey === 'pablo') return nrLeads
      return []
    }

    const fuLeads = allLeads.filter(l => l.stage === 'fu' && l.assignedTo && workerGhlIds.has(l.assignedTo))
    const chaseLeads = allLeads.filter(l => l.stage === 'chase' && l.assignedTo && workerGhlIds.has(l.assignedTo))

    const slots = ['morning', 'afternoon', 'evening'] as const
    const slotLines: string[] = []

    for (const slot of slots) {
      // Ziyad: morning + afternoon (7AM–3PM PST). Pablo: afternoon + evening (12PM–9PM PST)
      if (slot === 'morning' && workerKey === 'pablo') continue
      if (slot === 'evening' && workerKey === 'ziyad') continue

      const slotNr = getSlotNr(slot)
      const totalNr = slotNr.length
      const totalFu = fuLeads.length
      const totalChase = chaseLeads.length
      const total = totalNr + totalFu + totalChase

      const calledInSlot = workerLogs.filter(l => l.slot === slot).length
      const missed = Math.max(0, total - calledInSlot)

      const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1)
      slotLines.push(`  • ${slotLabel}: ${calledInSlot}/${total} called${missed > 0 ? `, *${missed} missed*` : ' ✓'}`)
    }

    const totalCalled = calledSet.size
    const name = workerKey.charAt(0).toUpperCase() + workerKey.slice(1)
    workerSections.push(`*${name}*\n${slotLines.join('\n')}`)
  }

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📞 EOD Call Report — ${today}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: workerSections.length > 0
            ? workerSections.join('\n\n')
            : '_No call data found for today._',
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Total leads in pipeline: *${allLeads.length}* (${nrLeads.length} NR, ${allLeads.filter(l => l.stage === 'fu').length} FU, ${allLeads.filter(l => l.stage === 'chase').length} Chase)`,
          },
        ],
      },
    ],
  }

  const slackRes = await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })

  if (!slackRes.ok) {
    return NextResponse.json({ error: `Slack error: ${slackRes.status}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, today, workerSections })
}
