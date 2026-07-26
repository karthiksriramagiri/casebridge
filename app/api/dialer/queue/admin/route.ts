import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// GET /api/dialer/queue/admin?firm=lhp&exhausted=false&limit=100&offset=0
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const firm      = searchParams.get('firm')      // optional filter
  const exhausted = searchParams.get('exhausted') // 'true' | 'false' | null = all
  const limit     = parseInt(searchParams.get('limit')  ?? '100', 10)
  const offset    = parseInt(searchParams.get('offset') ?? '0',   10)

  const db = supabaseAdmin()
  let q = db.from('dialer_queue').select('*', { count: 'exact' })

  if (firm)      q = q.eq('firm', firm)
  if (exhausted === 'true')  q = q.eq('exhausted', true)
  if (exhausted === 'false') q = q.eq('exhausted', false)

  q = q
    .order('exhausted',      { ascending: true })
    .order('priority',       { ascending: true })
    .order('last_called_at', { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Summary stats
  const { data: stats } = await db.from('dialer_queue')
    .select('exhausted, locked_by, callback_at, firm')
  const all = stats ?? []
  const summary = {
    total:     all.length,
    active:    all.filter((r: any) => !r.exhausted).length,
    exhausted: all.filter((r: any) => r.exhausted).length,
    locked:    all.filter((r: any) => r.locked_by).length,
    callbacks: all.filter((r: any) => r.callback_at && !r.exhausted).length,
    byFirm: {
      lhp:   all.filter((r: any) => r.firm === 'lhp'   && !r.exhausted).length,
      fears: all.filter((r: any) => r.firm === 'fears' && !r.exhausted).length,
    },
  }

  return NextResponse.json({ items: data, total: count, summary })
}
