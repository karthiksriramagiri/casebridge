import { NextRequest, NextResponse } from 'next/server'
import { admin } from '../../_lib'

export const dynamic = 'force-dynamic'

const EDITABLE = [
  'source_type', 'brand_name', 'label', 'video_url', 'ad_library_url',
  'first_seen', 'run_days', 'duration_seconds', 'aspect_ratio', 'batch', 'status',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const patch: Record<string, any> = {}
  for (const k of EDITABLE) if (k in body) patch[k] = body[k]
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data, error } = await admin().from('competitor_ads').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ad: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await admin().from('competitor_ads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
