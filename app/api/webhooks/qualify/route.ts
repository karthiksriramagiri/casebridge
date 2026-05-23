import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, buildQualifyEmail, FIRM_EMAIL_CONFIG } from '@/app/lib/sendgrid'

const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  // Validate secret
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

  console.log('[qualify] received payload:', JSON.stringify(payload, null, 2))

  // Extract contact fields — same multi-path approach as GHL webhooks
  const firstName =
    payload.first_name || payload.firstName ||
    payload.contact?.first_name || payload.contact?.firstName || ''
  const lastName =
    payload.last_name || payload.lastName ||
    payload.contact?.last_name || payload.contact?.lastName || ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  const email =
    payload.email || payload.contact?.email || null

  if (!email) {
    console.warn('[qualify] no email in payload — skipping')
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  if (!fullName) {
    console.warn('[qualify] no name in payload — skipping')
    return NextResponse.json({ error: 'Missing name' }, { status: 400 })
  }

  // Determine firm from query param or payload
  const customFields: Record<string, string> = {}
  if (Array.isArray(payload.customField)) {
    for (const cf of payload.customField) {
      if (cf.fieldKey) customFields[cf.fieldKey] = cf.value ?? ''
      if (cf.name) customFields[cf.name] = cf.value ?? ''
    }
  }

  const firmSlug =
    request.nextUrl.searchParams.get('firm') ||
    customFields.firm_slug || customFields.firmSlug || 'lhp'

  const firmConfig = FIRM_EMAIL_CONFIG[firmSlug] ?? FIRM_EMAIL_CONFIG['lhp']

  // Build and send qualification email via SendGrid
  const { subject, html, text } = buildQualifyEmail({
    firstName,
    fullName,
    firmName: firmConfig.firmName,
    firmPhone: firmConfig.firmPhone,
    firmEmail: firmConfig.firmEmail,
  })

  try {
    await sendEmail({ to: email, toName: fullName, subject, html, text })
    console.log(`[qualify] email sent to ${email} for firm=${firmSlug}`)
    return NextResponse.json({ success: true, emailSentTo: email, firm: firmSlug })
  } catch (err: any) {
    console.error('[qualify] SendGrid error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
