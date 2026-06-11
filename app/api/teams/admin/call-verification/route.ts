import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GHL_API_KEY     = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

async function hasGhlCall(contactId: string, dateISO: string): Promise<boolean> {
  if (!GHL_API_KEY) return false
  try {
    const url = `https://services.leadconnectorhq.com/contacts/${contactId}/activities/calls` +
      `?location_id=${GHL_LOCATION_ID}&limit=50`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
      cache: 'no-store',
    })
    if (!res.ok) return false
    const data: any = await res.json()
    const activities = data.activities || data.calls || []
    return activities.some((a: any) => {
      const calledAt = a.dateAdded || a.startedAt || a.createdAt || ''
      return calledAt.startsWith(dateISO)
    })
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ||
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // Fetch all call logs for the date
  const { data: logs } = await admin
    .from('call_logs')
    .select('contact_id, contact_name, worker_id, slot')
    .eq('date', date)

  if (!logs || logs.length === 0) {
    return NextResponse.json({ date, workers: [] })
  }

  // Get worker names
  const workerIds = [...new Set(logs.map(l => l.worker_id).filter(Boolean))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name')
    .in('id', workerIds)

  const nameMap: Record<string, string> = {}
  for (const p of profiles || []) nameMap[p.id] = p.name

  // Group unique contacts per worker
  const byWorker: Record<string, { contactId: string; contactName: string }[]> = {}
  for (const log of logs) {
    if (!log.worker_id) continue
    if (!byWorker[log.worker_id]) byWorker[log.worker_id] = []
    byWorker[log.worker_id].push({ contactId: log.contact_id, contactName: log.contact_name })
  }

  // Deduplicate contacts per worker
  for (const wid of Object.keys(byWorker)) {
    const seen = new Set<string>()
    byWorker[wid] = byWorker[wid].filter(c => {
      if (seen.has(c.contactId)) return false
      seen.add(c.contactId)
      return true
    })
  }

  // Verify each contact against GHL (with small delay to avoid rate limits)
  const workers: {
    workerName: string
    checked: number
    ghlVerified: number
    unverified: number
    unverifiedContacts: string[]
  }[] = []

  for (const wid of Object.keys(byWorker)) {
    const contacts = byWorker[wid]
    let ghlVerified = 0
    const unverifiedContacts: string[] = []

    for (const c of contacts) {
      const verified = await hasGhlCall(c.contactId, date)
      if (verified) {
        ghlVerified++
      } else {
        unverifiedContacts.push(c.contactName || c.contactId)
      }
      await new Promise(r => setTimeout(r, 80))
    }

    workers.push({
      workerName:         nameMap[wid] || wid,
      checked:            contacts.length,
      ghlVerified,
      unverified:         contacts.length - ghlVerified,
      unverifiedContacts,
    })
  }

  workers.sort((a, b) => a.workerName.localeCompare(b.workerName))

  return NextResponse.json({ date, workers })
}
