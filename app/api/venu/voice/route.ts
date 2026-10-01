import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser } from '@/app/venu/_lib/auth'
import { loadBaseline, saveBaseline } from '@/app/venu/_lib/voice-baseline-store'
import type { VoiceBaseline } from '@/app/venu/_lib/voice-baseline'

export async function GET() {
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return NextResponse.json({ baseline: await loadBaseline(user.id) })
}

export async function POST(req: NextRequest) {
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = (await req.json()) as VoiceBaseline
  console.log('[venu:voice] save from %s — neutral %s, warm %s',
    user.name, body?.neutral?.medianF0 ?? 'none', body?.warm?.medianF0 ?? 'none')

  if (!body?.neutral?.medianF0) {
    return NextResponse.json(
      { error: 'The neutral take had no usable pitch — record it again somewhere quieter.' },
      { status: 400 }
    )
  }

  try {
    await saveBaseline(user.id, { ...body, capturedAt: new Date().toISOString() })
  } catch (e) {
    console.error('[venu:voice] save failed', e)
    return NextResponse.json(
      { error: 'Could not save — has migration_venu_v3.sql been run?' },
      { status: 500 }
    )
  }
  console.log('[venu:voice] saved for %s', user.name)
  return NextResponse.json({ ok: true })
}
