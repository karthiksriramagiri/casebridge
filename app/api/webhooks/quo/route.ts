import { NextRequest, NextResponse } from 'next/server'

const SLACK_WEBHOOK   = process.env.SLACK_INBOUND_CALLS_WEBHOOK!
const GHL_API_KEY     = process.env.GHL_API_KEY!
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

async function lookupCallerInGHL(rawPhone: string): Promise<{ name: string } | null> {
  const normalized = normalizePhone(rawPhone)
  if (!normalized) return null

  const res = await fetch(
    `https://services.leadconnectorhq.com/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(rawPhone)}&limit=10`,
    { headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' } }
  )
  if (!res.ok) return null

  const contacts: any[] = (await res.json()).contacts || []
  const match = contacts.find(c => normalizePhone(c.phone || '') === normalized)
  if (!match) return null

  const name = [match.firstName, match.lastName].filter(Boolean).join(' ') || match.name || match.email || 'Unknown'
  return { name }
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { body = {} }

  const eventType: string = body.type ?? body.event_type ?? ''
  if (eventType && eventType !== 'call.ringing') {
    return NextResponse.json({ ok: true, skipped: eventType })
  }

  // Quo payload: phone is in body.data.object.from
  const callObj    = body.data?.object ?? {}
  const callerRaw: string = callObj.from ?? ''
  const toNumber: string  = callObj.to   ?? '—'
  const callId: string    = callObj.id   ?? body.id ?? '—'
  const callTime = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
  })

  let matchLine  = '❓ *Unknown caller* — not found in GHL'
  let headerText = `📞 Inbound Call — ${callerRaw || 'Unknown'}`

  if (callerRaw) {
    const match = await lookupCallerInGHL(callerRaw)
    if (match) {
      matchLine  = `✅ *${match.name}*`
      headerText = `📞 Inbound Call — ${match.name} (${callerRaw})`
    } else {
      matchLine  = `❓ *${callerRaw}* — not found in GHL`
    }
  }

  const callerLabel = callerRaw || 'Unknown number'
  const matchName   = matchLine.startsWith('✅') ? matchLine.replace('✅ *', '').replace('*', '') : null

  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: headerText,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `📞 *Inbound Call*`,
              `*Caller:* ${matchName ? `${matchName} · ${callerLabel}` : callerLabel}`,
              `*Calling:* ${toNumber}`,
            ].join('\n'),
          },
        },
      ],
    }),
  })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'quo-inbound-webhook' })
}
