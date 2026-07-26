import { NextRequest, NextResponse } from 'next/server'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

function ghlHeaders() {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return {
    Authorization: `Bearer ${key}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

// GET /api/dialer/leads?pipelineId=...&stageId=...&limit=20&cursor=<startAfter>&cursorId=<startAfterId>
// GHL uses cursor-based pagination. Pass cursor+cursorId from a previous response to get the next page.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const pipelineId = searchParams.get('pipelineId') ?? ''
  const stageId    = searchParams.get('stageId') ?? ''
  const limit      = parseInt(searchParams.get('limit') ?? '20', 10)
  const cursor     = searchParams.get('cursor') ?? ''
  const cursorId   = searchParams.get('cursorId') ?? ''
  const search     = searchParams.get('search') ?? ''

  if (!pipelineId || !stageId) {
    return NextResponse.json({ error: 'pipelineId and stageId are required' }, { status: 400 })
  }

  const url = new URL(`${GHL_BASE}/opportunities/search`)
  url.searchParams.set('location_id', LOCATION_ID)
  url.searchParams.set('pipeline_id', pipelineId)
  url.searchParams.set('pipeline_stage_id', stageId)
  url.searchParams.set('limit', String(limit))
  if (search)   url.searchParams.set('q', search)
  if (cursor)   url.searchParams.set('startAfter', cursor)
  if (cursorId) url.searchParams.set('startAfterId', cursorId)

  const res = await fetch(url.toString(), {
    headers: ghlHeaders(),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[dialer:leads] GHL error', res.status, text)
    return NextResponse.json({ error: 'GHL fetch failed', detail: text }, { status: 502 })
  }

  const data = await res.json()

  const leads = (data.opportunities ?? []).map((opp: any) => {
    const contact = opp.contact ?? {}
    // Phone: prefer mobile → phone → first available
    const phone =
      contact.phone ??
      (contact.phones?.find((p: any) => p.type === 'mobile') ?? contact.phones?.[0])?.number ??
      ''

    return {
      id: opp.id,
      name: opp.name ?? contact.name ?? 'Unknown',
      firstName: contact.firstName ?? '',
      lastName:  contact.lastName ?? '',
      phone,
      email: contact.email ?? '',
      company: opp.companyName ?? contact.companyName ?? '',
      status: opp.status ?? '',
      monetaryValue: opp.monetaryValue ?? 0,
      assignedTo: opp.assignedTo ?? '',
      contactId: opp.contactId ?? '',
      lastActivity: opp.lastActivityAt ?? opp.updatedAt ?? '',
      tags: contact.tags ?? [],
      source: contact.source ?? '',
    }
  })

  return NextResponse.json({
    leads,
    meta: {
      total: data.meta?.total ?? 0,
      limit,
      nextCursor: data.meta?.startAfter ?? null,
      nextCursorId: data.meta?.startAfterId ?? null,
      hasMore: !!data.meta?.nextPageUrl,
    },
  })
}
