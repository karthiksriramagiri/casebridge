import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// DELETE /api/metrics/case?id=<uuid>
// Permanently removes a signed case from ghl_leads
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('ghl_leads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/metrics/case
// Updates fields on a ghl_leads row: closer, second_closer, second_closer_profile_id, is_ot_close, case_status
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, any> = {}
  if ('closer' in body) update.closer = body.closer || null
  if ('second_closer' in body) update.second_closer = body.second_closer || null
  if ('second_closer_profile_id' in body) update.second_closer_profile_id = body.second_closer_profile_id || null
  if ('is_ot_close' in body) update.is_ot_close = body.is_ot_close === true
  if ('case_status' in body) update.case_status = body.case_status

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })

  const { error } = await supabase
    .from('ghl_leads')
    .update(update)
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When marking as replacement, also update the matching rep_cases row
  if (update.case_status === 'replacement') {
    const { data: lead } = await supabase.from('ghl_leads').select('contact_name').eq('id', id).single()
    if (lead?.contact_name) {
      await supabase
        .from('rep_cases')
        .update({ status: 'replacement' })
        .ilike('contact_name', lead.contact_name)
    }
  }

  return NextResponse.json({ ok: true })
}
