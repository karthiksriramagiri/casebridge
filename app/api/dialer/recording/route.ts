import { NextRequest, NextResponse } from 'next/server'

// GET /api/dialer/recording?url=<twilio_recording_url>
// Proxies the audio from Twilio with server-side Basic Auth so the browser
// never needs Twilio credentials to play recordings.
export async function GET(req: NextRequest) {
  const twilioUrl = req.nextUrl.searchParams.get('url')
  if (!twilioUrl) {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim()
  const authToken  = process.env.TWILIO_AUTH_TOKEN!.trim()
  const auth       = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const upstream = await fetch(twilioUrl, {
    headers: { Authorization: `Basic ${auth}` },
  })

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Failed to fetch recording' }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
