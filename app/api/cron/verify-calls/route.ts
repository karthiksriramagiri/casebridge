import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GHL_API_KEY     = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

// Fetch recent call activities for a contact from GHL
async function fetchContactCalls(contactId: string): Promise<{ calledAt: string; duration: number; direction: string }[]> {
  if (!GHL_API_KEY) return []

  try {
    const url = `https://services.leadconnectorhq.com/contacts/${contactId}/activities/calls` +
      `?location_id=${GHL_LOCATION_ID}&limit=50`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
      cache: 'no-store',
    })

    if (!res.ok) return []
    const data: any = await res.json()

    return (data.activities || data.calls || []).map((a: any) => ({
      calledAt:  a.dateAdded || a.startedAt || a.createdAt || '',
      duration:  a.duration || a.meta?.duration || 0,
      direction: a.direction || a.meta?.direction || 'outbound',
    })).filter((a: any) => a.calledAt)
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const todayStart = `${today}T00:00:00.000Z`
  const todayEnd   = `${today}T23:59:59.999Z`

  // Get today's call logs that haven't been verified yet
  const { data: logs } = await supabase
    .from('call_logs')
    .select('id, contact_id, called_at')
    .eq('date', today)
    .is('ghl_verified', null)

  if (!logs || logs.length === 0) {
    return NextResponse.json({ ok: true, verified: 0, unverified: 0 })
  }

  // Deduplicate contact IDs
  const uniqueContactIds = [...new Set(logs.map(l => l.contact_id))]

  let verified = 0
  let unverified = 0

  for (const contactId of uniqueContactIds) {
    const calls = await fetchContactCalls(contactId)

    // Check if any call happened today
    const todayCalls = calls.filter(c => c.calledAt >= todayStart && c.calledAt <= todayEnd)

    // Upsert each GHL call into ghl_call_activity
    for (const call of todayCalls) {
      await supabase
        .from('ghl_call_activity')
        .upsert(
          {
            contact_id:       contactId,
            called_at:        call.calledAt,
            duration_seconds: call.duration,
            direction:        call.direction,
            synced_date:      today,
          },
          { onConflict: 'contact_id,called_at' }
        )
    }

    // Mark all logs for this contact as verified or not
    const wasCalledInGhl = todayCalls.length > 0
    const logsForContact = logs.filter(l => l.contact_id === contactId)

    for (const log of logsForContact) {
      await supabase
        .from('call_logs')
        .update({ ghl_verified: wasCalledInGhl })
        .eq('id', log.id)

      if (wasCalledInGhl) verified++
      else unverified++
    }

    // Small delay to avoid hammering GHL API
    await new Promise(r => setTimeout(r, 100))
  }

  return NextResponse.json({ ok: true, verified, unverified, today })
}
