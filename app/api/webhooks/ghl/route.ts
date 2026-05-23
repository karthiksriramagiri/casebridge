import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { appendSignedCase } from '@/app/lib/google-sheets'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GHL sends a secret token — set GHL_WEBHOOK_SECRET in your env vars
// Configure GHL to send: POST /api/webhooks/ghl?secret=YOUR_SECRET
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

  console.log('[GHL webhook] received payload:', JSON.stringify(payload, null, 2))

  // Extract fields — GHL payloads vary by workflow trigger, so we try multiple paths
  const contactId =
    payload.contact_id || payload.contactId || payload.id || null

  const firstName =
    payload.first_name || payload.firstName ||
    payload.contact?.first_name || payload.contact?.firstName || ''
  const lastName =
    payload.last_name || payload.lastName ||
    payload.contact?.last_name || payload.contact?.lastName || ''
  const contactName = [firstName, lastName].filter(Boolean).join(' ') || null
  const contactPhone =
    payload.phone || payload.contact?.phone || null
  const contactEmail =
    payload.email || payload.contact?.email || null

  // Attribution fields — GHL may send these at root or under customField / customData
  const customFields: Record<string, string> = {}
  if (Array.isArray(payload.customField)) {
    for (const cf of payload.customField) {
      // Index by both fieldKey (e.g. "contact.firm_name") AND display name (e.g. "Firm Name")
      if (cf.fieldKey) customFields[cf.fieldKey] = cf.value
      if (cf.name) customFields[cf.name] = cf.value
    }
  }
  if (payload.customData && typeof payload.customData === 'object') {
    Object.assign(customFields, payload.customData)
  }

  const fbp = payload.fbp || customFields.fbp || customFields.fb_pixel || null
  const fbc = payload.fbc || customFields.fbc || null
  const sessionSource =
    payload.sessionSource || payload.session_source ||
    customFields.sessionSource || customFields.session_source || null

  const adName =
    payload.adName || payload.ad_name ||
    customFields.adName || customFields.ad_name ||
    customFields['Ad Name'] || payload['Ad Name'] || null
  const adId =
    payload.adId || payload.ad_id ||
    customFields.adId || customFields.ad_id ||
    customFields['Ad ID'] || payload['Ad ID'] ||
    payload.contact?.attributionSource?.adId ||
    payload.utm_content || customFields.utm_content || null
  const adsetId =
    payload.adGroupId || payload.adgroup_id || payload.adset_id ||
    customFields.adGroupId || customFields.adset_id ||
    customFields['Adset ID'] || payload['Adset ID'] ||
    payload.contact?.attributionSource?.adGroupId || null
  const campaignId =
    payload.campaignId || payload.campaign_id ||
    customFields.campaignId || customFields.campaign_id ||
    customFields['Campaign ID'] || payload['Campaign ID'] ||
    payload.contact?.attributionSource?.campaignId ||
    payload.utm_campaign || customFields.utm_campaign || null

  const utmSource =
    payload.utm_source || customFields.utm_source || null
  const utmMedium =
    payload.utm_medium || customFields.utm_medium || null
  const utmCampaign =
    payload.utm_campaign || customFields.utm_campaign || null
  const utmContent =
    payload.utm_content || customFields.utm_content || null
  const utmTerm =
    payload.utm_term || customFields.utm_term || null

  const closer =
    payload.Closer || payload.closer ||
    customFields['Closer'] || customFields.closer ||
    customFields['closer_name'] || null

  const workflowName =
    payload.workflow?.name || payload.workflowName ||
    customFields.workflowName || null
  const locationName =
    payload.location?.name || payload.locationName ||
    payload.location_name || customFields.locationName ||
    customFields['Firm Name'] || customFields.firm_name || null

  // Victim count from custom fields (multi-victim cases)
  const victimCount = parseInt(
    customFields.victim_count || customFields.victimCount ||
    customFields.number_of_victims || payload.victim_count || '1'
  ) || 1

  // Firm slug can be passed explicitly as a query param or custom field
  const firmSlugParam =
    request.nextUrl.searchParams.get('firm') ||
    customFields.firm_slug || customFields.firmSlug || null

  // Determine firm — explicit slug > ghl_location_name exact match > name ilike > first firm
  let firmId: string | null = null
  let firmRow: { id: string; name: string } | null = null

  if (firmSlugParam) {
    const { data } = await supabase
      .from('firms').select('id, name').eq('slug', firmSlugParam).single()
    if (data) firmRow = data
  }

  if (!firmRow && locationName) {
    // Try exact match on ghl_location_name first
    const { data } = await supabase
      .from('firms').select('id, name')
      .ilike('ghl_location_name', locationName).limit(1).single()
    if (data) firmRow = data
  }

  if (!firmRow && locationName) {
    // Fallback: partial match on firm name
    const { data } = await supabase
      .from('firms').select('id, name')
      .ilike('name', `%${locationName}%`).limit(1).single()
    if (data) firmRow = data
  }

  if (!firmRow) {
    const { data } = await supabase
      .from('firms').select('id, name')
      .order('created_at', { ascending: true }).limit(1).single()
    if (data) firmRow = data
  }

  firmId = firmRow?.id ?? null

  // Auto-assign invoice_code: find which invoice period today falls in
  let invoiceCode: string | null =
    customFields.invoice_code || customFields.invoiceCode ||
    request.nextUrl.searchParams.get('invoice') || null

  if (!invoiceCode && firmId) {
    // Get the latest invoice for this firm (highest sort_order / most recent period_start)
    const invUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/firm_invoices?select=code&firm_id=eq.${firmId}&order=sort_order.desc,period_start.desc&limit=1`
    const invRes = await fetch(invUrl, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    })
    const invRows = await invRes.json()
    console.log('[GHL webhook] invoice lookup — firmId:', firmId, 'result:', invRows)
    if (Array.isArray(invRows) && invRows.length > 0) invoiceCode = invRows[0].code
  }

  const { error } = await supabase.from('ghl_leads').insert({
    firm_id: firmId,
    contact_id: contactId,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    fbp,
    fbc,
    session_source: sessionSource,
    ad_name: adName,
    ad_id: adId,
    adset_id: adsetId,
    campaign_id: campaignId,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    closer,
    workflow_name: workflowName,
    location_name: locationName,
    victim_count: victimCount,
    invoice_code: invoiceCode,
    raw_payload: payload,
  })

  if (error) {
    console.error('GHL webhook insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Write to Google Sheet (fire-and-forget — don't fail the webhook if Sheets is down)
  const incidentDate =
    payload.incident_date || payload['Date of Accident*'] || payload['Date of Accident'] ||
    customFields.incident_date || customFields['Date of Accident*'] || customFields['Date of Accident'] || null

  const signUpDate = new Date().toISOString().split('T')[0]
  const sheetTab = invoiceCode ?? 'INV-1'

  if (contactName) {
    appendSignedCase({
      fullName: contactName,
      phone: contactPhone,
      email: contactEmail,
      dol: incidentDate,
      signUpDate,
      sheetTab,
    }).catch(err => console.error('[google-sheets] write failed:', err))
  }

  return NextResponse.json({ success: true })
}
