import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser } from '@/app/venu/_lib/auth'
import { DEFAULT_WEIGHTS, saveWeights, type DrawWeights } from '@/app/venu/_lib/draw-weights'

export async function POST(req: NextRequest) {
  const user = await getVenuUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }

  const body = await req.json()
  const next = {} as DrawWeights
  for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof DrawWeights)[]) {
    const raw = Number(body?.[key])
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      return NextResponse.json({ error: `${key} must be a number between 0 and 100` }, { status: 400 })
    }
    next[key] = raw
  }

  // Zeroing everything would leave the draw with nothing to pick from.
  const anyPositive = next.qualified > 0 || next.carNotQualified > 0 || next.escalateOther > 0
  if (!anyPositive) {
    return NextResponse.json({ error: 'At least one case type has to have a weight above zero' }, { status: 400 })
  }

  try {
    await saveWeights(next, user.id)
  } catch (e) {
    console.error('[venu:weights] save failed', e)
    return NextResponse.json(
      { error: 'Could not save — has migration_venu_v3.sql been run?' },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}
