import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST { ids: string[], action: 'link' | 'unlink' }
// link  → assigns the same accident_group_id to all ids (reuses existing group if any has one)
// unlink → sets accident_group_id = null for all ids
export async function POST(request: NextRequest) {
  const { ids, action } = await request.json()

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  if (action === 'unlink') {
    const { error } = await supabase
      .from('ghl_leads')
      .update({ accident_group_id: null })
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'link') {
    if (ids.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 PCs to link' }, { status: 400 })
    }

    // Reuse existing group id if any of the selected rows already belongs to one
    const { data: existing } = await supabase
      .from('ghl_leads')
      .select('accident_group_id')
      .in('id', ids)
      .not('accident_group_id', 'is', null)
      .limit(1)
      .single()

    const groupId: string = existing?.accident_group_id ?? randomUUID()

    const { error } = await supabase
      .from('ghl_leads')
      .update({ accident_group_id: groupId })
      .in('id', ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, groupId })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
