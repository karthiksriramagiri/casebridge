import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('dialer_queue_config')
    .select('*')
    .order('firm').order('priority')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ configs: data })
}

// PUT /api/dialer/queue/config
// Body: { firm, stage_name, calls_per_day, max_attempts, priority, recency_boost }
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { firm, stage_name, calls_per_day, max_attempts, priority, recency_boost } = body

  if (!firm || !stage_name) {
    return NextResponse.json({ error: 'firm and stage_name required' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data, error } = await db.from('dialer_queue_config')
    .upsert({ firm, stage_name, calls_per_day, max_attempts, priority, recency_boost, updated_at: new Date().toISOString() },
      { onConflict: 'firm,stage_name' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
