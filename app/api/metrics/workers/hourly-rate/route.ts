import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH /api/metrics/workers/hourly-rate
// Body: { profile_id, hourly_rate }
// Upserts the active (no effective_to) pay rate row; creates one if none exists
export async function PATCH(req: NextRequest) {
  const { profile_id, hourly_rate } = await req.json()
  if (!profile_id || hourly_rate == null) {
    return NextResponse.json({ error: 'profile_id and hourly_rate required' }, { status: 400 })
  }

  // Find existing active rate
  const { data: existing } = await supabase
    .from('worker_pay_rates')
    .select('id')
    .eq('profile_id', profile_id)
    .is('effective_to', null)
    .maybeSingle()

  let result
  if (existing) {
    result = await supabase
      .from('worker_pay_rates')
      .update({ hourly_rate })
      .eq('id', existing.id)
      .select()
      .single()
  } else {
    result = await supabase
      .from('worker_pay_rates')
      .insert({ profile_id, hourly_rate, weekly_rate: 0, effective_from: new Date().toISOString().slice(0, 10) })
      .select()
      .single()
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ rate: result.data })
}
