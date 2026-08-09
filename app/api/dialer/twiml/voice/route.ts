import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

const VoiceResponse = twilio.twiml.VoiceResponse

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.trim()
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.trim()}`
  return 'https://acutely-pronto-unloved.ngrok-free.dev'
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const body     = new URLSearchParams(rawBody)
  const confName = body.get('ConferenceName')
  const mode     = body.get('Mode') ?? 'barge'
  const coachSid = body.get('CoachSid')
  const to       = body.get('To') ?? ''

  const twiml = new VoiceResponse()
  const base  = baseUrl()

  if (confName) {
    const dial = twiml.dial()
    const confAttrs: Record<string, any> = {
      endConferenceOnExit: mode === 'rep' ? 'true' : 'false',
    }

    if (mode === 'rep') {
      // Rep joins their own conference — starts and ends with them.
      // earlyMedia on the customer participant pipes their ringback tone to the rep.
      confAttrs.startConferenceOnEnter = 'true'
      confAttrs.beep = 'false'
      confAttrs.statusCallback = `${base}/api/dialer/twiml/conference-status`
      confAttrs.statusCallbackEvent = 'start end join leave'
      confAttrs.statusCallbackMethod = 'POST'
    } else if (mode === 'listen') {
      confAttrs.startConferenceOnEnter = 'false'
      confAttrs.muted = 'true'
    } else if (mode === 'whisper' && coachSid) {
      confAttrs.startConferenceOnEnter = 'false'
      confAttrs.coach = coachSid
    } else {
      // barge
      confAttrs.startConferenceOnEnter = 'false'
    }

    dial.conference(confAttrs as any, confName)
  } else if (to.startsWith('client:')) {
    const dial = twiml.dial()
    dial.client(to.replace('client:', ''))
  } else if (to) {
    // Legacy direct dial (fallback, no monitoring support)
    const dial = twiml.dial({
      callerId: process.env.TWILIO_CALLER_ID || '+12137344168',
      record: 'record-from-answer-dual-channel',
      recordingStatusCallback: `${base}/api/dialer/twiml/recording`,
      recordingStatusCallbackMethod: 'POST',
      timeout: 30,
    } as any)
    dial.number(to)
  } else {
    twiml.say('No destination provided.')
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
