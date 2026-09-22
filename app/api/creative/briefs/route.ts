import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/* GET  /api/creative/briefs?language=english
   Returns the whole board in one call — a board is a few hundred rows at
   most, and paging it would break drag-and-drop ordering across columns.

   POST /api/creative/briefs
   Creates a card at the top of its column.                                  */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const language = req.nextUrl.searchParams.get('language') || 'english'

  const { data, error } = await supabase
    .from('creative_briefs')
    .select(`
      id, title, status, ad_type, language, assignee_id, due_date,
      must_launch, brief, deliverable_url, launched_ad_id, position,
      benchmark_url, benchmark_name, benchmark_kind,
      created_at, updated_at,
      assignee:profiles!creative_briefs_assignee_id_fkey ( id, name ),
      creative_brief_comments ( id )
    `)
    .eq('language', language)
    .order('position', { ascending: true })

  if (error) {
    // The table not existing yet is the common case before the migration is
    // run — report it as an empty board with a reason rather than a 500, so
    // the page renders its empty state instead of an error card.
    const missing = /relation .* does not exist|schema cache/i.test(error.message)
    if (missing) return NextResponse.json({ briefs: [], needsMigration: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const briefs = (data || []).map((b: any) => ({
    ...b,
    assigneeName: b.assignee?.name ?? null,
    commentCount: b.creative_brief_comments?.length ?? 0,
    assignee: undefined,
    creative_brief_comments: undefined,
  }))

  return NextResponse.json({ briefs })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const title = (body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })

  const status = body.status || 'assigned'
  const language = body.language || 'english'

  // Place the new card at the top of its column: one below the current
  // smallest position, so it does not collide with an existing row.
  const { data: top } = await supabase
    .from('creative_briefs')
    .select('position')
    .eq('language', language)
    .eq('status', status)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  const position = (top?.position ?? 1000) - 100

  const { data, error } = await supabase
    .from('creative_briefs')
    .insert({
      title,
      status,
      language,
      position,
      ad_type: body.ad_type || null,
      assignee_id: body.assignee_id || null,
      due_date: body.due_date || null,
      must_launch: !!body.must_launch,
      brief: body.brief || null,
      deliverable_url: body.deliverable_url || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brief: { ...data, commentCount: 0, assigneeName: null } })
}
