import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET

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

  // Extract custom fields by both fieldKey and display name
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

  const contactId = payload.contact_id || payload.contactId || payload.id || null
  const contactPhone = payload.phone || payload.contact?.phone || null
  const contactEmail = payload.email || payload.contact?.email || null
  const firstName = payload.first_name || payload.firstName || payload.contact?.first_name || ''
  const lastName = payload.last_name || payload.lastName || payload.contact?.last_name || ''
  const fullName = (payload.full_name || payload.name || [firstName, lastName].filter(Boolean).join(' ')).trim() || null

  if (!contactId && !contactPhone && !contactEmail && !fullName) {
    return NextResponse.json({ error: 'Need contact_id, phone, email, or full_name to find the case.' }, { status: 400 })
  }

  // Find the existing case across all invoices — contact_id > phone > email > name
  let existingCase: { id: string } | null = null

  if (contactId) {
    const { data } = await supabase
      .from('ghl_leads').select('id').eq('contact_id', contactId)
      .order('created_at', { ascending: false }).limit(1).single()
    if (data) existingCase = data
  }

  if (!existingCase && contactPhone) {
    const { data } = await supabase
      .from('ghl_leads').select('id').eq('contact_phone', contactPhone)
      .order('created_at', { ascending: false }).limit(1).single()
    if (data) existingCase = data
  }

  if (!existingCase && contactEmail) {
    const { data } = await supabase
      .from('ghl_leads').select('id').eq('contact_email', contactEmail)
      .order('created_at', { ascending: false }).limit(1).single()
    if (data) existingCase = data
  }

  if (!existingCase && fullName) {
    const { data } = await supabase
      .from('ghl_leads').select('id').ilike('contact_name', fullName)
      .order('created_at', { ascending: false }).limit(1).single()
    if (data) existingCase = data
  }

  if (!existingCase) {
    return NextResponse.json({ error: 'No matching case found for this contact.' }, { status: 404 })
  }

  const { error } = await supabase
    .from('ghl_leads')
    .update({ case_status: 'replacement' })
    .eq('id', existingCase.id)

  if (error) {
    console.error('GHL replacement webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: existingCase.id })
}
