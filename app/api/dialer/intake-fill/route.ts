import { NextRequest, NextResponse } from 'next/server'
import { runIntakeFill, previewIntakeEvidence } from '@/app/dialer/_lib/intake-fill'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { contactId, contactIds } = body

  // Dry run — show what would be read, spend no Anthropic call.
  if (contactId && body.preview) {
    return NextResponse.json(await previewIntakeEvidence(contactId))
  }

  // Single contact
  if (contactId && !contactIds) {
    const result = await runIntakeFill(contactId)
    return NextResponse.json(result)
  }

  // Batch (sequential to respect GHL rate limits)
  if (contactIds && Array.isArray(contactIds)) {
    if (contactIds.length > 25) {
      return NextResponse.json({ error: 'Max 25 contacts per batch' }, { status: 400 })
    }
    const results = []
    for (const id of contactIds) {
      const result = await runIntakeFill(id)
      results.push(result)
    }
    return NextResponse.json({ results })
  }

  return NextResponse.json({ error: 'contactId or contactIds[] required' }, { status: 400 })
}
