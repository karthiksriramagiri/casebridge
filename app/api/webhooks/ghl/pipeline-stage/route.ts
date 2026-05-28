import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET

// Valid pipeline stages GHL can send
const VALID_STAGES = new Set(['no_response', 'not_qualified', 'follow_up', 'chase', 'sent'])

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

  console.log('[pipeline-stage] received payload:', JSON.stringify(payload, null, 2))

  // Stage — from query param or payload
  const stageParam =
    request.nextUrl.searchParams.get('stage') ||
    payload.stage || payload.pipeline_stage || null

  if (!stageParam || !VALID_STAGES.has(stageParam)) {
    return NextResponse.json(
      { error: `Invalid or missing stage. Valid: ${[...VALID_STAGES].join(', ')}` },
      { status: 400 }
    )
  }

  // Contact fields
  const contactId =
    payload.contact_id || payload.contactId || payload.id || null
  const firstName =
    payload.first_name || payload.firstName ||
    payload.contact?.first_name || payload.contact?.firstName || ''
  const lastName =
    payload.last_name || payload.lastName ||
    payload.contact?.last_name || payload.contact?.lastName || ''
  const contactName = [firstName, lastName].filter(Boolean).join(' ') || null
  const contactPhone = payload.phone || payload.contact?.phone || null
  const contactEmail = payload.email || payload.contact?.email || null

  // Custom fields
  const customFields: Record<string, string> = {}
  if (Array.isArray(payload.customField)) {
    for (const cf of payload.customField) {
      if (cf.fieldKey) customFields[cf.fieldKey] = cf.value
      if (cf.name) customFields[cf.name] = cf.value
    }
  }
  if (payload.customData && typeof payload.customData === 'object') {
    Object.assign(customFields, payload.customData)
  }

  // Attribution — from payload first, then inherit from signed record if missing
  let adId =
    payload.adId || payload.ad_id ||
    customFields.adId || customFields.ad_id ||
    payload.contact?.attributionSource?.adId ||
    payload.utm_content || customFields.utm_content || null
  let adName =
    payload.adName || payload.ad_name ||
    customFields.adName || customFields.ad_name ||
    customFields['Ad Name'] || null
  let adsetId =
    payload.adGroupId || payload.adset_id ||
    customFields.adGroupId || customFields.adset_id || null
  let campaignId =
    payload.campaignId || payload.campaign_id ||
    customFields.campaignId || customFields.campaign_id ||
    payload.utm_campaign || customFields.utm_campaign || null
  let utmSource   = payload.utm_source   || customFields.utm_source   || null
  let utmMedium   = payload.utm_medium   || customFields.utm_medium   || null
  let utmCampaign = payload.utm_campaign || customFields.utm_campaign || null
  let utmContent  = payload.utm_content  || customFields.utm_content  || null
  let utmTerm     = payload.utm_term     || customFields.utm_term     || null

  // If no ad attribution in payload, look up the contact's signed record to inherit it
  const missingAdAttrib = (!adId || adId.includes('{{')) && !adName
  if (contactId && missingAdAttrib) {
    const { data: signedRecord } = await supabase
      .from('ghl_leads')
      .select('ad_id, ad_name, adset_id, campaign_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term')
      .eq('contact_id', contactId)
      .is('pipeline_stage', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (signedRecord) {
      adId        = adId        || signedRecord.ad_id
      adName      = adName      || signedRecord.ad_name
      adsetId     = adsetId     || signedRecord.adset_id
      campaignId  = campaignId  || signedRecord.campaign_id
      utmSource   = utmSource   || signedRecord.utm_source
      utmMedium   = utmMedium   || signedRecord.utm_medium
      utmCampaign = utmCampaign || signedRecord.utm_campaign
      utmContent  = utmContent  || signedRecord.utm_content
      utmTerm     = utmTerm     || signedRecord.utm_term
    }
  }

  // Firm resolution
  const locationName =
    payload.location?.name || payload.locationName ||
    payload.location_name || customFields.locationName ||
    customFields['Firm Name'] || customFields.firm_name || null
  const firmSlugParam =
    request.nextUrl.searchParams.get('firm') ||
    customFields.firm_slug || customFields.firmSlug || null

  let firmRow: { id: string } | null = null

  if (firmSlugParam) {
    const { data } = await supabase.from('firms').select('id').eq('slug', firmSlugParam).single()
    if (data) firmRow = data
  }
  if (!firmRow && locationName) {
    const { data } = await supabase.from('firms').select('id').ilike('ghl_location_name', locationName).limit(1).single()
    if (data) firmRow = data
  }
  if (!firmRow && locationName) {
    const { data } = await supabase.from('firms').select('id').ilike('name', `%${locationName}%`).limit(1).single()
    if (data) firmRow = data
  }
  if (!firmRow) {
    const { data } = await supabase.from('firms').select('id').order('created_at', { ascending: true }).limit(1).single()
    if (data) firmRow = data
  }

  const firmId = firmRow?.id ?? null

  // Auto-assign invoice_code — same as main webhook
  let invoiceCode: string | null = null
  if (firmId) {
    const invUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/firm_invoices?select=code&firm_id=eq.${firmId}&order=sort_order.desc,period_start.desc&limit=1`
    const invRes = await fetch(invUrl, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    })
    const invRows = await invRes.json()
    if (Array.isArray(invRows) && invRows.length > 0) invoiceCode = invRows[0].code
  }

  // If this contact already has a signed case record, just update its pipeline_stage
  // (handles the case where a signed contact later goes NR)
  if (contactId) {
    const { data: existing } = await supabase
      .from('ghl_leads')
      .select('id, pipeline_stage')
      .eq('contact_id', contactId)
      .is('pipeline_stage', null)          // only signed records (pipeline_stage IS NULL = signed)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      // Don't overwrite a signed record's stage — these are separate pipeline records
      // Fall through to insert a new pipeline record below
    }
  }

  // Check if a pipeline record already exists for this contact+stage — update it
  if (contactId) {
    const { data: existingPipeline } = await supabase
      .from('ghl_leads')
      .select('id')
      .eq('contact_id', contactId)
      .eq('pipeline_stage', stageParam)
      .limit(1)
      .single()

    if (existingPipeline) {
      // Update the existing pipeline record
      const { error } = await supabase
        .from('ghl_leads')
        .update({
          ad_id: adId,
          ad_name: adName,
          adset_id: adsetId,
          campaign_id: campaignId,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
          utm_term: utmTerm,
          invoice_code: invoiceCode,
          raw_payload: payload,
        })
        .eq('id', existingPipeline.id)

      if (error) {
        console.error('[pipeline-stage] update error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'updated', id: existingPipeline.id })
    }
  }

  // Insert new pipeline record
  const { data: inserted, error } = await supabase.from('ghl_leads').insert({
    firm_id: firmId,
    contact_id: contactId,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    ad_id: adId,
    ad_name: adName,
    adset_id: adsetId,
    campaign_id: campaignId,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    invoice_code: invoiceCode,
    pipeline_stage: stageParam,
    location_name: locationName,
    raw_payload: payload,
  }).select('id').single()

  if (error) {
    console.error('[pipeline-stage] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, action: 'created', id: inserted?.id })
}
