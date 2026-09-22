import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

/* GET  /api/creative/briefs/comments?brief_id=…  — the feedback thread
   POST /api/creative/briefs/comments             — add to it              */

export async function GET(req: NextRequest) {
  const briefId = req.nextUrl.searchParams.get('brief_id')
  if (!briefId) return NextResponse.json({ error: 'brief_id is required.' }, { status: 400 })

  const { data, error } = await supabase
    .from('creative_brief_comments')
    .select('id, body, author_name, created_at')
    .eq('brief_id', briefId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ comments: [] })
  return NextResponse.json({ comments: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.brief_id || !(body.body || '').trim()) {
    return NextResponse.json({ error: 'brief_id and body are required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('creative_brief_comments')
    .insert({
      brief_id: body.brief_id,
      body: String(body.body).trim(),
      author_name: body.author_name || 'Admin',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data })
}
