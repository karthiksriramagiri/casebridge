import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

/* PATCH /api/creative/briefs/:id — edit a card, or move it between columns.
   DELETE /api/creative/briefs/:id                                            */

const EDITABLE = [
  'title', 'status', 'ad_type', 'assignee_id', 'due_date',
  'must_launch', 'brief', 'deliverable_url', 'launched_ad_id', 'position',
  'benchmark_url', 'benchmark_name', 'benchmark_kind',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  // Only ever write the known columns: the client sends whole card objects
  // back on a drag, and an unfiltered spread would try to write the joined
  // assigneeName / commentCount fields that do not exist on the table.
  const patch: Record<string, any> = {}
  for (const key of EDITABLE) {
    if (key in body) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('creative_briefs')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brief: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('creative_briefs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
