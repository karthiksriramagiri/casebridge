import { NextRequest, NextResponse } from 'next/server'

/* ═══════════════════════════════════════════════════════════════════════════
   Upwork OAuth2 — where Upwork sends the candidate-facing account back to.

   Registered on the API key as the Callback URL, so it has to resolve on the
   www host exactly: the apex 307s to www, and a redirect between the two
   would both mismatch the registered URI and risk dropping the query string.

   Upwork returns ?code=…&state=… here. The code is single-use and short-lived,
   so it is exchanged for tokens immediately — unless the client credentials
   are not configured yet, in which case the code is shown so the handshake can
   be finished by hand while the key is still being reviewed.
   ═══════════════════════════════════════════════════════════════════════════ */

const TOKEN_URL = 'https://www.upwork.com/api/v3/oauth2/token'
const REDIRECT_URI = `${(process.env.NEXT_PUBLIC_BASE_URL || 'https://www.case-bridge.com').replace(/\/$/, '')}/api/upwork/callback`

const CLIENT_ID = (process.env.UPWORK_CLIENT_ID || '').trim()
const CLIENT_SECRET = (process.env.UPWORK_CLIENT_SECRET || '').trim()

function page(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <body style="font:15px/1.6 ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:14vh auto;padding:0 22px;color:#1b1714">
       <h1 style="font-size:22px;letter-spacing:-.02em">${title}</h1>${body}
     </body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const code = params.get('code')
  const error = params.get('error')

  if (error) {
    return page('Upwork authorisation failed', `<p>Upwork returned <code>${error}</code>. Start the connection again.</p>`, 400)
  }
  if (!code) {
    // Upwork pings the callback during key review; answer plainly rather than erroring.
    return page('Upwork callback', '<p>This endpoint receives the Upwork authorisation code. Nothing to do without one.</p>')
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return page(
      'Authorisation code received',
      `<p>Set <code>UPWORK_CLIENT_ID</code> and <code>UPWORK_CLIENT_SECRET</code>, then exchange this code within a few minutes:</p>
       <pre style="background:#f4f1ea;padding:14px;border-radius:8px;overflow:auto"><code>${code}</code></pre>`
    )
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  })
  const token = await res.json().catch(() => null)

  if (!res.ok || !token?.access_token) {
    console.error('[upwork] token exchange failed', res.status, token)
    return page('Could not complete the connection', `<p>Upwork rejected the exchange: <code>${token?.error_description || token?.error || res.status}</code></p>`, 502)
  }

  /* Tokens are deliberately not persisted yet — there is nowhere to put them
     that is better than an env var until the integration proper is built, and
     writing a refresh token into a table nobody has reviewed is worse than
     printing it once for a human to place. */
  console.log('[upwork] connected — access token expires in', token.expires_in, 'seconds')

  return page(
    'Upwork connected',
    `<p>Store these, then this page can go away:</p>
     <pre style="background:#f4f1ea;padding:14px;border-radius:8px;overflow:auto"><code>UPWORK_ACCESS_TOKEN=${token.access_token}
UPWORK_REFRESH_TOKEN=${token.refresh_token ?? '(none returned)'}</code></pre>
     <p style="color:#857d72;font-size:13px">The access token expires in ${Math.round((token.expires_in ?? 0) / 60)} minutes; the refresh token is the one that matters.</p>`
  )
}
