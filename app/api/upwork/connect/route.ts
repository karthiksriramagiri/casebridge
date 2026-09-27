import { NextResponse } from 'next/server'
import { getVenuUser } from '@/app/venu/_lib/auth'

/* Starts the Upwork handshake: sends an admin to Upwork's consent screen and
   lets the callback pick up the code. Admin-only — anyone who can reach this
   URL can bind the company's Upwork account to our key. */

const AUTHORIZE_URL = 'https://www.upwork.com/ab/account-security/oauth2/authorize'
const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.case-bridge.com').replace(/\/$/, '')

export async function GET() {
  const user = await getVenuUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const clientId = (process.env.UPWORK_CLIENT_ID || '').trim()
  if (!clientId) {
    return NextResponse.json({ error: 'UPWORK_CLIENT_ID is not set.' }, { status: 500 })
  }

  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', `${BASE}/api/upwork/callback`)
  // Upwork echoes state back to the callback; it is the CSRF check on the return trip.
  url.searchParams.set('state', crypto.randomUUID())

  return NextResponse.redirect(url.toString())
}
