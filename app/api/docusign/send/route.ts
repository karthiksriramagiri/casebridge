import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!
const USER_ID = process.env.DOCUSIGN_USER_ID!
const ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID!
const BASE_URL = process.env.DOCUSIGN_BASE_URL!
const AUTH_SERVER = process.env.DOCUSIGN_AUTH_SERVER!
const TEMPLATE_ID = process.env.DOCUSIGN_TEMPLATE_ID!
const PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY || '').replace(/\\n/g, '\n')
const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET

// Cache token in memory for its lifetime
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value

  const payload = {
    iss: INTEGRATION_KEY,
    sub: USER_ID,
    aud: AUTH_SERVER,
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  }

  const assertion = jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256' })

  const res = await fetch(`https://${AUTH_SERVER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'DocuSign auth failed')
  }

  cachedToken = { value: data.access_token, expiresAt: now + 3600 }
  return data.access_token
}

export async function GET() {
  // Consent URL helper — visit once to grant JWT consent
  const consentUrl =
    `https://${AUTH_SERVER}/oauth/auth?response_type=code` +
    `&scope=signature%20impersonation` +
    `&client_id=${INTEGRATION_KEY}` +
    `&redirect_uri=https://www.case-bridge.com/api/docusign/callback`
  return NextResponse.json({ consentUrl })
}

export async function POST(request: NextRequest) {
  if (WEBHOOK_SECRET) {
    const secret = request.nextUrl.searchParams.get('secret')
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[DocuSign] webhook payload:', JSON.stringify(payload, null, 2))

  // Extract contact fields — same multi-path approach as existing GHL webhooks
  const firstName =
    payload.first_name || payload.firstName ||
    payload.contact?.first_name || payload.contact?.firstName || ''
  const lastName =
    payload.last_name || payload.lastName ||
    payload.contact?.last_name || payload.contact?.lastName || ''
  const clientName = [firstName, lastName].filter(Boolean).join(' ').trim()
  const email =
    payload.email || payload.contact?.email || null
  const phone =
    payload.phone || payload.contact?.phone || null

  // Custom fields sent from GHL webhook
  const customFields: Record<string, string> = {}
  if (Array.isArray(payload.customField)) {
    for (const cf of payload.customField) {
      if (cf.fieldKey) customFields[cf.fieldKey] = cf.value ?? ''
      if (cf.name) customFields[cf.name] = cf.value ?? ''
    }
  }
  if (payload.customData && typeof payload.customData === 'object') {
    Object.assign(customFields, payload.customData)
  }

  const incidentDate =
    payload.incident_date ||
    payload['Date of Accident*'] ||
    payload['Date of Accident'] ||
    customFields.incident_date ||
    customFields['Date of Accident*'] ||
    customFields['Date of Accident'] || ''

  const incidentLocation =
    payload.incident_location ||
    payload['Accident Location'] ||
    payload['City Of Accident'] ||
    customFields.incident_location ||
    customFields['Accident Location'] ||
    customFields['City Of Accident'] || ''

  if (!clientName || !email) {
    return NextResponse.json(
      { error: 'Missing required fields: name and email are required' },
      { status: 400 }
    )
  }

  if (!TEMPLATE_ID) {
    return NextResponse.json({ error: 'DOCUSIGN_TEMPLATE_ID env var not set' }, { status: 500 })
  }

  try {
    const token = await getAccessToken()

    // First fetch the template to discover tab labels by tooltip
    const tplRes = await fetch(
      `${BASE_URL}/v2.1/accounts/${ACCOUNT_ID}/templates/${TEMPLATE_ID}/recipients`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const tplData = await tplRes.json()
    console.log('[DocuSign] template recipients:', JSON.stringify(tplData, null, 2))

    // Build tab override map: find text tabs whose tooltip matches our field names
    const tooltipMap: Record<string, string> = {
      client_name: clientName,
      client_name_print: clientName,
      incident_date: incidentDate,
      incident_location: incidentLocation,
    }

    // Discover tabLabels from the template by matching tooltip values
    const textTabOverrides: Array<{ tabLabel: string; value: string }> = []
    const signers: any[] = tplData.signers || []
    for (const signer of signers) {
      for (const tab of signer.tabs?.textTabs || []) {
        const tooltip = (tab.tooltip || '').toLowerCase().replace(/\s+/g, '_')
        const tabLabel = tab.tabLabel
        if (tooltipMap[tooltip] !== undefined) {
          textTabOverrides.push({ tabLabel, value: tooltipMap[tooltip] })
        }
      }
    }

    console.log('[DocuSign] tab overrides:', JSON.stringify(textTabOverrides, null, 2))

    // Build envelope from template
    const envelope = {
      templateId: TEMPLATE_ID,
      templateRoles: [
        {
          roleName: 'Client',
          name: clientName,
          email,
          ...(phone ? { phoneNumber: { countryCode: '1', number: phone.replace(/\D/g, '') } } : {}),
          tabs: {
            textTabs: textTabOverrides,
          },
        },
      ],
      status: 'sent',
      emailSubject: 'Please sign your Larry H. Parker Agreement',
      emailBlurb:
        `Hi ${firstName || clientName},\n\nPlease review and sign your retainer agreement with The Law Offices of Larry H. Parker. This takes just a few minutes.\n\nIf you have any questions, please call us at (562) 427-2044.`,
    }

    const sendRes = await fetch(
      `${BASE_URL}/v2.1/accounts/${ACCOUNT_ID}/envelopes`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      }
    )

    const sendData = await sendRes.json()
    console.log('[DocuSign] envelope response:', JSON.stringify(sendData, null, 2))

    if (!sendRes.ok) {
      return NextResponse.json(
        { error: sendData.message || 'Failed to create envelope' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      envelopeId: sendData.envelopeId,
      status: sendData.status,
    })
  } catch (err: any) {
    console.error('[DocuSign] error:', err)
    // Consent required — return the URL so the user can grant it
    if (err.message?.includes('consent_required') || err.message?.includes('DocuSign auth failed')) {
      const consentUrl =
        `https://${AUTH_SERVER}/oauth/auth?response_type=code` +
        `&scope=signature%20impersonation` +
        `&client_id=${INTEGRATION_KEY}` +
        `&redirect_uri=https://www.case-bridge.com/api/docusign/callback`
      return NextResponse.json({ error: 'Consent required', consentUrl }, { status: 403 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
