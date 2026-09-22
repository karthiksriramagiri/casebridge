import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, venuAdmin } from '@/app/venu/_lib/auth'

// Assign track permissions. Admin only.
export async function POST(req: NextRequest) {
  const user = await getVenuUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }

  const { userId, setter, closer } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const patch: Record<string, boolean> = {}
  if (typeof setter === 'boolean') patch.venu_setter = setter
  if (typeof closer === 'boolean') patch.venu_closer = closer
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const { error } = await venuAdmin().from('profiles').update(patch).eq('id', userId)
  if (error) {
    console.error('[venu:admin] permission update failed', error)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
