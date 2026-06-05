import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_WEBHOOK = process.env.SLACK_SHIFT_REPORT_WEBHOOK || ''
const GHL_API_KEY     = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

const SLOT_LABELS: Record<string, string> = {
  morning:   'Morning  (7AM–12PM PST)',
  afternoon: 'Afternoon  (12PM–3PM PST)',
  evening:   'Evening  (3PM–9PM PST)',
}

// Slot windows in EST (24h)
// At the cron fire time, this tells us which slot just ended
function getSlotFromHour(estHour: number): 'morning' | 'afternoon' | 'evening' | null {
  if (estHour === 15) return 'morning'    // 3PM EST → morning (7AM–12PM PST) just ended
  if (estHour === 18) return 'afternoon'  // 6PM EST → afternoon (12PM–3PM PST) just ended
  if (estHour === 0 || estHour === 1) return 'evening' // midnight EST → evening (3PM–9PM PST) just ended
  return null
}

// Slot time ranges in PST → UTC offset for GHL call verification
const SLOT_UTC_RANGES: Record<string, { startHourUTC: number; endHourUTC: number }> = {
  morning:   { startHourUTC: 15, endHourUTC: 20 }, // 7AM–12PM PST = 15:00–20:00 UTC (PDT, UTC-7)
  afternoon: { startHourUTC: 19, endHourUTC: 22 }, // 12PM–3PM PST = 19:00–22:00 UTC
  evening:   { startHourUTC: 22, endHourUTC: 4  }, // 3PM–9PM PST = 22:00–04:00 UTC (next day)
}

async function fetchGhlCallsForContact(contactId: string, todayISO: string): Promise<number> {
  if (!GHL_API_KEY) return 0
  try {
    const url = `https://services.leadconnectorhq.com/contacts/${contactId}/activities/calls` +
      `?location_id=${GHL_LOCATION_ID}&limit=50`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
      cache: 'no-store',
    })
    if (!res.ok) return 0
    const data: any = await res.json()
    const activities = data.activities || data.calls || []
    // Count calls that happened today
    return activities.filter((a: any) => {
      const calledAt = a.dateAdded || a.startedAt || a.createdAt || ''
      return calledAt.startsWith(todayISO)
    }).length
  } catch {
    return 0
  }
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Allow manual override via ?slot=morning|afternoon|evening
  const slotOverride = request.nextUrl.searchParams.get('slot') as 'morning' | 'afternoon' | 'evening' | null

  const now = new Date()
  const estHour = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
  ) % 24
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const reportSlot = slotOverride || getSlotFromHour(estHour)
  if (!reportSlot) {
    return NextResponse.json({ error: `No slot ending at EST hour ${estHour}` }, { status: 400 })
  }

  // Fetch all workers with shifts
  const { data: workers } = await supabase
    .from('profiles')
    .select('id, name, shift')
    .not('shift', 'is', null)

  if (!workers || workers.length === 0) {
    return NextResponse.json({ ok: true, message: 'No workers with shifts found' })
  }

  // Shifts that include this slot
  const SHIFT_SLOTS: Record<string, string[]> = {
    morning:           ['morning'],
    afternoon:         ['afternoon'],
    evening:           ['evening'],
    morning_afternoon: ['morning', 'afternoon'],
    afternoon_evening: ['afternoon', 'evening'],
  }

  const slotWorkers = workers.filter(w => (SHIFT_SLOTS[w.shift] || []).includes(reportSlot))
  if (slotWorkers.length === 0) {
    return NextResponse.json({ ok: true, message: `No workers assigned to ${reportSlot} slot` })
  }

  // Fetch call logs for this slot + today for all slot workers
  const workerIds = slotWorkers.map(w => w.id)
  const { data: callLogs } = await supabase
    .from('call_logs')
    .select('contact_id, worker_id, contact_name')
    .eq('date', today)
    .eq('slot', reportSlot)
    .in('worker_id', workerIds)

  const logsByWorker: Record<string, { contact_id: string; contact_name: string | null }[]> = {}
  for (const w of slotWorkers) logsByWorker[w.id] = []
  for (const log of (callLogs || [])) {
    if (logsByWorker[log.worker_id]) {
      logsByWorker[log.worker_id].push({ contact_id: log.contact_id, contact_name: log.contact_name })
    }
  }

  // For each worker, get unique contacts called and verify GHL calls
  const workerReports: {
    name: string
    checked: number
    ghlVerified: number
    unverified: number
  }[] = []

  for (const worker of slotWorkers) {
    const logs = logsByWorker[worker.id] || []
    const uniqueContacts = [...new Map(logs.map(l => [l.contact_id, l])).values()]
    const checked = uniqueContacts.length

    // Check GHL for each contact (batched with small delay to avoid rate limits)
    let ghlVerified = 0
    for (const contact of uniqueContacts) {
      const count = await fetchGhlCallsForContact(contact.contact_id, today)
      if (count > 0) ghlVerified++
      await new Promise(r => setTimeout(r, 80))
    }

    workerReports.push({
      name:        worker.name,
      checked,
      ghlVerified,
      unverified:  checked - ghlVerified,
    })
  }

  // Build Slack message
  const slotLabel = SLOT_LABELS[reportSlot]
  const dateLabel = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month:   'short',
    day:     'numeric',
  })

  const workerBlocks = workerReports.map(r => {
    const checkPct = r.checked > 0 ? Math.round((r.ghlVerified / r.checked) * 100) : 0
    const lines = [
      `*${r.name}*`,
      `• Checkmarked on Teams: *${r.checked}*`,
      `• Verified in GHL: *${r.ghlVerified}*  (${checkPct}% match)`,
      r.unverified > 0
        ? `• ⚠️ Unverified: *${r.unverified}* — marked done but no GHL call found`
        : `• ✅ All calls verified in GHL`,
    ]
    return lines.join('\n')
  })

  const message = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📞 ${slotLabel} — End of Shift Report` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: dateLabel }],
      },
      { type: 'divider' },
      ...workerReports.map((_, i) => ({
        type: 'section',
        text: { type: 'mrkdwn', text: workerBlocks[i] },
      })),
    ],
  }

  const slackRes = await fetch(SLACK_WEBHOOK, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(message),
  })

  if (!slackRes.ok) {
    return NextResponse.json({ error: `Slack error: ${slackRes.status}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, slot: reportSlot, workerReports })
}
