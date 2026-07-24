import { NextRequest, NextResponse } from 'next/server'

const GHL_BASE    = 'https://services.leadconnectorhq.com'
const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

function ghlHeaders() {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return {
    Authorization: `Bearer ${key}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

// GET /api/dialer/contacts/search?q=<name or phone>
// Searches GHL contacts by name or phone — used for the new-message lead picker
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  if (!q) return NextResponse.json({ contacts: [] })

  const url = new URL(`${GHL_BASE}/contacts/`)
  url.searchParams.set('locationId', LOCATION_ID)
  url.searchParams.set('query', q)
  url.searchParams.set('limit', '20')

  const res = await fetch(url.toString(), {
    headers: ghlHeaders(),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[contacts:search] GHL error', res.status, text)
    return NextResponse.json({ contacts: [] })
  }

  const data = await res.json()

  const contacts = (data.contacts ?? []).map((c: any) => ({
    id:    c.id,
    name:  c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
    phone: c.phone ?? '',
    email: c.email ?? '',
    tags:  c.tags ?? [],
  })).filter((c: any) => c.phone)

  return NextResponse.json({ contacts })
}

// Also used server-side to look up a contact by exact phone number
export async function lookupByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  const url = new URL(`${GHL_BASE}/contacts/search/duplicate`)
  url.searchParams.set('locationId', LOCATION_ID)
  url.searchParams.set('phone', phone)

  const key = (process.env.GHL_API_KEY ?? '').trim()
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${key}`,
      Version: '2021-07-28',
    },
    cache: 'no-store',
  })

  if (!res.ok) return null
  const data = await res.json()
  const c = data.contact ?? data.contacts?.[0]
  if (!c?.id) return null
  return {
    id:   c.id,
    name: c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
  }
}
