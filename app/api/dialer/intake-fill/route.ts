import { NextRequest, NextResponse } from 'next/server'
import { runIntakeFill, previewIntakeEvidence } from '@/app/dialer/_lib/intake-fill'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { contactId, contactIds, fresh, subject } = body

  /* A redo clears the intake fields and re-extracts; a subject re-points the
     extraction at someone else in the vehicle. Both are destructive on
     purpose — they exist because what is on the contact is wrong. */
  const opts = {
    fresh: fresh === true,
    subject: subject && typeof subject.name === 'string' && subject.name.trim()
      ? { name: String(subject.name).trim(), relationship: subject.relationship ? String(subject.relationship) : undefined }
      : null,
  }

  // Dry run — show what would be read, spend no Anthropic call.
  if (contactId && body.preview) {
    return NextResponse.json(await previewIntakeEvidence(contactId))
  }

  // Single contact
  if (contactId && !contactIds) {
    const result = await runIntakeFill(contactId, opts)
    return NextResponse.json(result)
  }

  // Batch (sequential to respect GHL rate limits)
  if (contactIds && Array.isArray(contactIds)) {
    if (contactIds.length > 25) {
      return NextResponse.json({ error: 'Max 25 contacts per batch' }, { status: 400 })
    }
    const results = []
    for (const id of contactIds) {
      const result = await runIntakeFill(id, opts)
      results.push(result)
    }
    return NextResponse.json({ results })
  }

  return NextResponse.json({ error: 'contactId or contactIds[] required' }, { status: 400 })
}
