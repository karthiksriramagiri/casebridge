import { NextRequest, NextResponse } from 'next/server'
import { getNextLeads } from '@/app/dialer/_lib/queue-engine'

// GET /api/dialer/queue/next?rep=karthik&count=5
export async function GET(req: NextRequest) {
  const rep   = req.nextUrl.searchParams.get('rep') ?? ''
  const count = parseInt(req.nextUrl.searchParams.get('count') ?? '5', 10)

  if (!rep) return NextResponse.json({ error: 'rep required' }, { status: 400 })

  const leads = await getNextLeads(rep, count)
  return NextResponse.json({ leads })
}
