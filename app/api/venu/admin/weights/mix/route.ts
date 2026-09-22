import { NextResponse } from 'next/server'
import { getVenuUser } from '@/app/venu/_lib/auth'
import { NUANCE_SCENARIOS } from '@/app/venu/_lib/nuance-scenarios'
import { loadWeights, weightFor, bucketOf, BUCKET_ORDER } from '@/app/venu/_lib/draw-weights'

/** The projected draw mix under the currently saved weights. */
export async function GET() {
  const user = await getVenuUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }
  return NextResponse.json({ buckets: await projectMix() })
}

export async function projectMix() {
  const weights = await loadWeights()
  const totals: Record<string, { w: number; n: number }> = {}
  for (const s of NUANCE_SCENARIOS) {
    const b = bucketOf(s)
    totals[b] ??= { w: 0, n: 0 }
    totals[b].w += weightFor(s, weights)
    totals[b].n += 1
  }
  const grand = Object.values(totals).reduce((a, t) => a + t.w, 0) || 1
  return BUCKET_ORDER.filter((b) => totals[b]).map((b) => ({
    bucket: b,
    scenarios: totals[b].n,
    share: Math.round((totals[b].w / grand) * 100),
  }))
}
