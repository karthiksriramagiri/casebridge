import { NextRequest, NextResponse } from 'next/server'
import { GHL_BASE, ghlHeaders, CF_LABELS } from '@/app/dialer/_lib/ghl-fields'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Contact ID required' }, { status: 400 })

  const res = await fetch(`${GHL_BASE}/contacts/${id}`, {
    headers: ghlHeaders(),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[dialer:contact] GHL error', res.status, text)
    return NextResponse.json({ error: 'GHL fetch failed' }, { status: 502 })
  }

  const data = await res.json()
  const c = data.contact ?? data

  // Map custom fields — only include ones with a known label and non-empty value
  const customFields: Array<{ label: string; value: string }> = []
  for (const cf of c.customFields ?? []) {
    const label = CF_LABELS[cf.id]
    const value = cf.value ?? cf.fieldValue
    if (label && value !== null && value !== undefined && value !== '') {
      customFields.push({ label, value: String(value) })
    }
  }

  return NextResponse.json({
    contact: {
      id: c.id,
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      name: c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      email: c.email ?? '',
      phone: c.phone ?? '',
      country: c.country ?? '',
      timezone: c.timezone ?? '',
      source: c.source ?? '',
      dateAdded: c.dateAdded ?? '',
      tags: c.tags ?? [],
      customFields,
      attributionSource: c.attributionSource?.sessionSource ?? '',
    },
  })
}
