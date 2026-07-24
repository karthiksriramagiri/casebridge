import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

function b64url(obj: object) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signJwt(header: object, payload: object, secret: string) {
  const input = b64url(header) + '.' + b64url(payload)
  const sig = createHmac('sha256', secret)
    .update(input)
    .digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return input + '.' + sig
}

export async function GET(req: NextRequest) {
  const accountSid   = process.env.TWILIO_ACCOUNT_SID!.trim()
  const apiKeySid    = process.env.TWILIO_API_KEY_SID!.trim()
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET!.trim()
  const twimlAppSid  = process.env.TWILIO_TWIML_APP_SID!.trim()
  const identity     = (req.nextUrl.searchParams.get('identity') || 'agent').trim()

  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: 'HS256',
    typ: 'JWT',
    cty: 'twilio-fpa;v=1',
  }

  const payload = {
    jti: `${apiKeySid}-${now}`,
    iss: apiKeySid,
    sub: accountSid,
    iat: now,
    exp: now + 3600,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: twimlAppSid },
      },
    },
  }

  const token = signJwt(header, payload, apiKeySecret)

  // Debug log
  console.log('[dialer:token] payload:', JSON.stringify(payload))
  console.log('[dialer:token] iss len:', apiKeySid.length, 'sub len:', accountSid.length, 'secret len:', apiKeySecret.length)

  return NextResponse.json({ token, identity })
}
