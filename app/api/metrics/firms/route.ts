import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('firms')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ firms: data ?? [] })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { name, slug, case_value, phase_initial_max_weekly_spend, phase_scale_max_weekly_spend, meta_account_id } = body

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: 'Name and slug are required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('firms')
    .insert({
      name: name.trim(),
      slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
      case_value: Number(case_value) || 0,
      phase_initial_max_weekly_spend: Number(phase_initial_max_weekly_spend) || 5000,
      phase_scale_max_weekly_spend: Number(phase_scale_max_weekly_spend) || 15000,
      meta_account_id: meta_account_id?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ firm: data })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const { error } = await supabase
    .from('firms')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
