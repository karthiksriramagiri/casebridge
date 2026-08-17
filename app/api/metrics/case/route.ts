import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GHL_API_KEY      = (process.env.GHL_API_KEY ?? '').trim()
const GHL_LOCATION_ID  = 'AGAoUCwWTwc4Bqslwt9r'
const GHL_API_BASE     = 'https://services.leadconnectorhq.com'

const PIPELINES = [
  { id: 'yMqNixSnChC5lcGQXA1g', firm: 'lhp'   },
  { id: 'Jj4DCdu5duYDgI87ERbx', firm: 'fears'  },
  { id: '0tBzhg0eGSNKL870y3yV', firm: 'jm'     },
]

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
  // and cancel any pending dialer attempts (e.g. MIA leads being called)
  if (update.case_status === 'replacement') {
    const { data: lead } = await supabase.from('ghl_leads').select('contact_name, contact_id').eq('id', id).single()
    if (lead?.contact_name) {
      await supabase
        .from('rep_cases')
        .update({ status: 'replacement' })
        .ilike('contact_name', lead.contact_name)
    }
    if (lead?.contact_id) {
      await supabase
        .from('dialer_attempts')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('contact_id', lead.contact_id)
        .in('status', ['pending', 'buffered', 'leased'])
      console.log('[case] Cancelled dialer attempts for replaced lead', { contactId: lead.contact_id })
    }
  }

  // When marking as MIA, move the GHL opportunity to the MIA stage
  if (update.case_status === 'mia' && GHL_API_KEY) {
    const { data: lead } = await supabase
      .from('ghl_leads')
      .select('contact_id, firm_id')
      .eq('id', id)
      .single()

    if (lead?.contact_id) {
      // Look up the firm slug from firm_id
      const { data: firm } = await supabase
        .from('firms')
        .select('slug')
        .eq('id', lead.firm_id)
        .single()

      const pipeline = PIPELINES.find(p => p.firm === firm?.slug)
      if (pipeline) {
        try {
          const headers = {
            Authorization: `Bearer ${GHL_API_KEY}`,
            Version: '2021-07-28',
            'Content-Type': 'application/json',
          }

          // Fetch pipeline stages to find MIA stage ID
          const pRes = await fetch(
            `${GHL_API_BASE}/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`,
            { headers }
          )
          if (pRes.ok) {
            const pData = await pRes.json()
            const pl = (pData.pipelines ?? []).find((p: any) => p.id === pipeline.id)
            const miaStage = (pl?.stages ?? []).find(
              (s: any) => s.name.toLowerCase() === 'mia'
            )

            if (miaStage) {
              // Search for the contact's opportunity in this pipeline
              const searchRes = await fetch(
                `${GHL_API_BASE}/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=${pipeline.id}&contact_id=${lead.contact_id}&limit=1`,
                { headers }
              )
              if (searchRes.ok) {
                const searchData = await searchRes.json()
                const opp = (searchData.opportunities ?? [])[0]
                if (opp?.id) {
                  await fetch(`${GHL_API_BASE}/opportunities/${opp.id}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ pipelineStageId: miaStage.id }),
                  })
                  console.log('[case] Moved to MIA stage', { oppId: opp.id, contactId: lead.contact_id })
                }
              }
            }
          }
        } catch (err) {
          console.error('[case] MIA GHL stage move failed', err)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
