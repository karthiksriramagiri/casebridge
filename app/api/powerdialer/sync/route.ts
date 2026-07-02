import { NextRequest, NextResponse } from 'next/server'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_KEY = process.env.GHL_API_KEY!
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!
const LHP_PIPELINE_ID = 'yMqNixSnChC5lcGQXA1g'

// GHL stage ID → powerdialer.ai webhook URL
const STAGE_MAP: Record<string, { name: string; webhookUrl: string }> = {
  '1175a360-9914-4ce5-906d-d89adb27c732': {
    name: 'No Response',
    webhookUrl: 'https://power-dialer-backend-343035658909.us-central1.run.app/api/webhook/public/900b61c1-c7dc-41f9-a348-e415f911143c',
  },
  '87759fbc-6d3e-46b1-aa47-9ae42ff88393': {
    name: 'Follow Up Required',
    webhookUrl: 'https://power-dialer-backend-343035658909.us-central1.run.app/api/webhook/public/f158d817-f2df-4dcf-b2c8-63ea979a35c3',
  },
  '1a4eed62-09ea-4108-ab64-2e16930350d6': {
    name: 'Chase',
    webhookUrl: 'https://power-dialer-backend-343035658909.us-central1.run.app/api/webhook/public/c6bd3cec-a01b-4c76-919e-63a1f7c0fdd7',
  },
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  }
}

async function fetchAllOpportunitiesForStage(stageId: string) {
  const opps: any[] = []
  let startAfter: number | null = null
  let startAfterId: string | null = null
  let page = 0

  while (true) {
    const params = new URLSearchParams({
      location_id: GHL_LOCATION_ID,
      pipeline_id: LHP_PIPELINE_ID,
      pipeline_stage_id: stageId,
      limit: '100',
      ...(startAfter ? { startAfter: String(startAfter), startAfterId: startAfterId! } : {}),
    })

    const res = await fetch(`${GHL_API_BASE}/opportunities/search?${params}`, {
      headers: ghlHeaders(),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GHL API ${res.status}: ${text}`)
    }
    const data = await res.json()
    const batch = data.opportunities || []
    opps.push(...batch)
    page++

    const meta = data.meta || {}
    if (batch.length < 100 || !meta.startAfter) break
    startAfter = meta.startAfter
    startAfterId = meta.startAfterId
    if (page > 100) break // safety cap at 10,000 contacts
  }

  return opps
}

async function sendToPowerDialer(webhookUrl: string, opp: any) {
  const contact = opp.contact || {}
  const nameParts = (contact.name || opp.name || '').split(' ')
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const payload = {
    firstName,
    lastName,
    name: contact.name || opp.name || '',
    phone: contact.phone || '',
    email: contact.email || '',
    contactId: contact.id || opp.contactId || '',
    opportunityId: opp.id || '',
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { ok: res.ok, status: res.status }
}

// POST /api/powerdialer/sync?secret=...
// Backfills all contacts from the LHP No Response, Follow Up Required, and Chase stages.
// Add ?stage=<stageId> to sync just one stage.
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stageFilter = req.nextUrl.searchParams.get('stage')
  const stagesToSync = stageFilter
    ? (STAGE_MAP[stageFilter] ? { [stageFilter]: STAGE_MAP[stageFilter] } : null)
    : STAGE_MAP

  if (!stagesToSync) {
    return NextResponse.json({ error: 'Unknown stage ID' }, { status: 400 })
  }

  const results: Record<string, { name: string; total: number; sent: number; errors: number }> = {}

  for (const [stageId, { name, webhookUrl }] of Object.entries(stagesToSync)) {
    let sent = 0, errors = 0, total = 0
    try {
      const opps = await fetchAllOpportunitiesForStage(stageId)
      total = opps.length
      for (const opp of opps) {
        try {
          const r = await sendToPowerDialer(webhookUrl, opp)
          if (r.ok) sent++
          else errors++
        } catch {
          errors++
        }
      }
    } catch (err: any) {
      console.error(`[powerdialer-sync] stage ${stageId} error:`, err.message)
      results[stageId] = { name, total: 0, sent: 0, errors: -1 }
      continue
    }
    results[stageId] = { name, total, sent, errors }
    console.log(`[powerdialer-sync] ${name}: total=${total} sent=${sent} errors=${errors}`)
  }

  return NextResponse.json({ ok: true, results })
}
