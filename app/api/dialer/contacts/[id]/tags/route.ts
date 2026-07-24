import { NextRequest, NextResponse } from 'next/server'

const GHL_BASE = 'https://services.leadconnectorhq.com'

function ghlHeaders() {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return {
    Authorization: `Bearer ${key}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

// PUT /api/dialer/contacts/[id]/tags
// Body: { tags: string[] }  — full replacement (GHL replaces all tags)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { tags } = await req.json()

  if (!id) return NextResponse.json({ error: 'Contact ID required' }, { status: 400 })

  const res = await fetch(`${GHL_BASE}/contacts/${id}`, {
    method: 'PUT',
    headers: ghlHeaders(),
    body: JSON.stringify({ tags }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[dialer:tags] GHL error', res.status, text)
    return NextResponse.json({ error: 'GHL update failed', detail: text }, { status: 502 })
  }

  const data = await res.json()
  return NextResponse.json({ tags: data.contact?.tags ?? tags })
}
