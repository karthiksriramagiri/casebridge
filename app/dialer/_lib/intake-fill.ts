// Auto-fill GHL intake fields by reading call transcripts + SMS and extracting
// structured data via Claude. Writes back to GHL contact custom fields.
// Only fills empty fields — never overwrites existing values.
// NEVER adds or modifies tags — only fills fields.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { GHL_BASE, ghlHeaders, INTAKE_FIELDS } from './ghl-fields'
import { getConversationData, fetchImageAsBase64 } from './ghl-conversations'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface IntakeFillResult {
  contactId:   string
  contactName: string
  firm:        string | null
  extracted:   Record<string, string | null>   // label → extracted value
  written:     Record<string, string>          // label → value written to GHL
  skipped:     Record<string, string>          // label → existing value (not overwritten)
  flags:       string[]
  summary:     string
  error?:      string
}

// ── Build the Claude system prompt ──────────────────────────────────────────

function buildSystemPrompt(): string {
  const fieldLines = Object.entries(INTAKE_FIELDS).map(([id, { label, hint }]) =>
    `- "${id}" (${label}): ${hint}`
  ).join('\n')

  return `You are an intake assistant for a personal injury law firm. You will be given call transcripts, SMS messages, and any photos the client texted in, from conversations with a potential client who has signed a retainer agreement.

Your job is to extract intake information to fill out the case form. Follow these rules strictly:

EXTRACTION RULES:
1. Extract ONLY facts that are explicitly stated or clearly communicated in the transcripts/messages, or plainly visible in an attached photo.
2. Never guess, infer, or make up information. If something is not discussed, use null.
3. For Yes/No fields, only use "Yes" or "No" — nothing else.
4. For dates, use YYYY-MM-DD format (e.g. 2026-08-28).
5. For the Incident Notes field, write a detailed narrative of how the accident happened based on what the client described. Use complete sentences. Include who hit who, direction of travel, and circumstances.
6. For Injuries Sustained, list each injury mentioned (e.g. "Back pain, neck pain, shoulder pain").
7. For insurance fields, just put the company name (e.g. "State Farm", "GEICO", "Liability only").
8. For Police Report #, include the report number AND department if both mentioned (e.g. "Report #24-12345, La Habra PD").
9. For Driver's License, include the number AND state (e.g. "D1234567, CA").

PHOTOS:
- Photos are attached as images at the start of the message when the client sent any.
- Read them for: vehicle damage, license plate numbers, vehicle make/model/colour,
  visible injuries, police report paperwork, and insurance cards.
- Transcribe a plate or policy number only if you can read every character with
  confidence. A misread plate is worse than a blank field — leave it null and flag it.
- A photo showing damage is enough to answer "Vehicle Damaged?" and to describe the
  damage, but do not infer fault, speed, or injury severity from a photo.

CUSTOM FIELDS TO EXTRACT (use the field ID as JSON key):
${fieldLines}

STANDARD FIELD (use "dateOfBirth" as the JSON key):
- "dateOfBirth": Client's date of birth in YYYY-MM-DD format

ALSO INCLUDE:
- "_summary": A 4-6 sentence plain-English intake summary a paralegal can read in 15 seconds to decide if this case is ready to send to the firm.
- "_flags": An array of short strings for anything needing human attention: missing critical info (date of accident, injuries, fault), inconsistent dates, possible red flags, statute of limitations concerns, prior attorney involvement, etc.

Respond with ONLY a raw JSON object. No markdown fences, no commentary, no explanation.`
}

// ── Gather all available data for a contact ─────────────────────────────────

async function gatherData(contactId: string) {
  const db = supabaseAdmin()
  const hdrs = ghlHeaders('sendcase')

  // Our dialer's own records plus GHL's — a case often has calls that never
  // went through our dialer, and the photos people text in live only in GHL.
  const [ghlRes, { data: transcripts }, { data: messages }, convo] = await Promise.all([
    fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: hdrs, cache: 'no-store' }),
    db.from('dialer_transcripts')
      .select('full_text, utterances, completed_at')
      .eq('contact_id', contactId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: true }),
    db.from('dialer_messages')
      .select('direction, body, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true }),
    getConversationData(contactId),
  ])

  let contact: any = null
  if (ghlRes.ok) {
    const data = await ghlRes.json()
    contact = data.contact ?? data
  }

  return {
    contact,
    transcripts: transcripts ?? [],
    messages: messages ?? [],
    ghlCalls: convo.callTranscripts,
    images: convo.images,
  }
}

// ── Build existing field values map ─────────────────────────────────────────

function getExistingValues(contact: any): { custom: Record<string, string>; dob: string | null } {
  const custom: Record<string, string> = {}
  let dob: string | null = null

  // Standard DOB field
  if (contact?.dateOfBirth) {
    dob = contact.dateOfBirth
  }

  // Custom fields
  if (contact?.customFields) {
    for (const cf of contact.customFields) {
      if (!(cf.id in INTAKE_FIELDS)) continue
      const val = cf.value ?? cf.fieldValue
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        custom[cf.id] = String(val)
      }
    }
  }

  return { custom, dob }
}

// ── Build the context string for Claude ─────────────────────────────────────

function buildContext(
  contact: any,
  existing: Record<string, string>,
  existingDob: string | null,
  transcripts: any[],
  messages: any[],
  ghlCalls: { text: string; dateAdded: string | null; direction: string | null }[] = [],
  imageCount = 0
): string {
  const sections: string[] = []

  // Contact basics
  if (contact) {
    const name = contact.name ?? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
    const phone = contact.phone ?? ''
    const email = contact.email ?? ''
    sections.push(`CLIENT: ${name} | Phone: ${phone} | Email: ${email}`)
  }

  // Already-filled fields (so Claude can see what's known and avoid re-extracting)
  const filledLines: string[] = []
  if (existingDob) filledLines.push(`Date of Birth: ${existingDob}`)
  for (const [id, val] of Object.entries(existing)) {
    const label = INTAKE_FIELDS[id]?.label ?? id
    filledLines.push(`${label}: ${val}`)
  }
  if (filledLines.length > 0) {
    sections.push(`EXISTING INTAKE FIELDS (already filled — do not re-extract these):\n${filledLines.join('\n')}`)
  }

  if (imageCount > 0) {
    sections.push(
      `PHOTOS: ${imageCount} image(s) the client texted in are attached to this message. ` +
      `Read them for vehicle damage, license plates, make/model, visible injuries, ` +
      `police report paperwork, and insurance cards. Only record what you can actually ` +
      `see — if a plate or document is blurry or cut off, leave the field blank and flag it.`
    )
  }

  // Call transcripts
  if (transcripts.length > 0) {
    const txText = transcripts.map((tx, i) => {
      const date = tx.completed_at ? new Date(tx.completed_at).toLocaleDateString() : 'unknown date'
      if (tx.utterances && Array.isArray(tx.utterances) && tx.utterances.length > 0) {
        const lines = tx.utterances.map((u: any) =>
          `${u.speaker === 0 ? 'Agent' : 'Lead'}: ${u.text}`
        ).join('\n')
        return `Call ${i + 1} (${date}):\n${lines}`
      }
      return `Call ${i + 1} (${date}):\n${tx.full_text}`
    }).join('\n\n')
    sections.push(`CALL TRANSCRIPTS:\n${txText}`)
  }

  // Calls that happened in GHL rather than through our dialer — for many cases
  // this is the only recorded conversation that exists.
  if (ghlCalls.length > 0) {
    const ghlText = ghlCalls.map((c, i) => {
      const date = c.dateAdded ? new Date(c.dateAdded).toLocaleDateString() : 'unknown date'
      const dir = c.direction === 'inbound' ? 'inbound' : 'outbound'
      return `GHL Call ${i + 1} (${date}, ${dir}):\n${c.text}`
    }).join('\n\n')
    sections.push(`GHL CALL TRANSCRIPTS:\n${ghlText}`)
  }

  // SMS messages
  if (messages.length > 0) {
    const smsText = messages.map(m =>
      `${m.direction === 'inbound' ? 'Lead' : 'Rep'}: ${m.body}`
    ).join('\n')
    sections.push(`SMS MESSAGES:\n${smsText}`)
  }

  return sections.join('\n\n---\n\n')
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function runIntakeFill(contactId: string): Promise<IntakeFillResult> {
  const db = supabaseAdmin()
  const result: IntakeFillResult = {
    contactId,
    contactName: '',
    firm: null,
    extracted: {},
    written: {},
    skipped: {},
    flags: [],
    summary: '',
  }

  // 1. Gather data
  const { contact, transcripts, messages, ghlCalls, images } = await gatherData(contactId)

  if (contact) {
    result.contactName = contact.name ?? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
  }

  // Resolve firm from tags (e.g. "lhp - ps" → "lhp")
  const tags: string[] = contact?.tags ?? []
  const psTag = tags.find(t => t.endsWith(' - ps'))
  if (psTag) {
    result.firm = psTag.replace(' - ps', '').trim()
  }

  // Any one of these is enough to work from. This used to check only our own
  // dialer's records, so a case whose entire history lived in GHL — which is
  // most of them — bailed out here with "no data".
  const haveEvidence =
    transcripts.length > 0 || messages.length > 0 || ghlCalls.length > 0 || images.length > 0
  if (!haveEvidence) {
    result.error = 'No transcripts, SMS, GHL calls, or photos found for this contact'
    result.flags = ['No conversation data available — cannot extract intake fields']
    await saveResult(db, result)
    return result
  }

  // 2. Build existing values + context
  const { custom: existing, dob: existingDob } = getExistingValues(contact)
  const context = buildContext(
    contact, existing, existingDob, transcripts, messages, ghlCalls, images.length
  )

  // 3. Call Claude
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    result.error = 'ANTHROPIC_API_KEY not configured'
    await saveResult(db, result)
    return result
  }

  let parsed: Record<string, any>
  try {
    const client = new Anthropic({ apiKey: anthropicKey })

    // Photos the client texted in — damage shots, police reports, insurance
    // cards. Fetched as base64 because the model needs the bytes, and a URL
    // that 404s would silently drop the evidence.
    const imageBlocks: any[] = []
    for (const img of images) {
      const fetched = await fetchImageAsBase64(img)
      if (!fetched) continue
      imageBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: fetched.mediaType, data: fetched.data },
      })
    }
    console.log(`[intake-fill] ${contactId}: ${ghlCalls.length} GHL calls, ${imageBlocks.length}/${images.length} images attached`)

    const msg = await client.messages.create({
      model:      'claude-opus-5',
      max_tokens: 8000,
      system:     buildSystemPrompt(),
      messages: [{
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: context }],
      }],
    })

    const text = (msg.content[0] as any)?.text ?? ''
    const cleaned = text.replace(/```json?\n?|```/g, '').trim()
    parsed = JSON.parse(cleaned)
  } catch (err: any) {
    result.error = `Claude extraction failed: ${err.message}`
    await saveResult(db, result)
    return result
  }

  // 4. Extract summary and flags
  result.summary = parsed._summary ?? ''
  result.flags = Array.isArray(parsed._flags) ? parsed._flags : []

  // 5. Merge logic — only write fields that are empty in GHL
  const toWrite: Array<{ id: string; field_value: string }> = []
  const standardUpdates: Record<string, string> = {}

  // Handle DOB (standard GHL field, not custom)
  if (parsed.dateOfBirth && !existingDob) {
    const dob = String(parsed.dateOfBirth).trim()
    if (dob && dob !== 'null') {
      standardUpdates.dateOfBirth = dob
      result.extracted['Date of Birth'] = dob
      result.written['Date of Birth'] = dob
    }
  } else if (existingDob) {
    result.skipped['Date of Birth'] = existingDob
  }

  // Handle custom fields
  for (const fieldId of Object.keys(INTAKE_FIELDS)) {
    const extracted = parsed[fieldId]
    const label = INTAKE_FIELDS[fieldId].label

    if (extracted === null || extracted === undefined || String(extracted).trim() === '' || String(extracted).trim() === 'null') {
      result.extracted[label] = null
      continue
    }

    const value = String(extracted).trim()
    result.extracted[label] = value

    if (existing[fieldId]) {
      result.skipped[label] = existing[fieldId]
    } else {
      toWrite.push({ id: fieldId, field_value: value })
      result.written[label] = value
    }
  }

  // 6. Write to GHL — custom fields + standard fields in one PUT, NO tags
  const hasCustom = toWrite.length > 0
  const hasStandard = Object.keys(standardUpdates).length > 0

  if (hasCustom || hasStandard) {
    try {
      const body: any = {}
      if (hasCustom) body.customFields = toWrite
      if (hasStandard) Object.assign(body, standardUpdates)

      const writeRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
        method: 'PUT',
        headers: ghlHeaders('sendcase'),
        body: JSON.stringify(body),
      })
      if (!writeRes.ok) {
        const errText = await writeRes.text()
        result.error = `GHL write failed (${writeRes.status}): ${errText}`
        console.error('[intake-fill] GHL write error', writeRes.status, errText)
      } else {
        console.log(`[intake-fill] Wrote ${toWrite.length} custom + ${Object.keys(standardUpdates).length} standard fields for ${contactId}`)
      }
    } catch (err: any) {
      result.error = `GHL write error: ${err.message}`
      console.error('[intake-fill] GHL write exception', err)
    }
  }

  // 7. Save result to Supabase for monitoring
  await saveResult(db, result)

  return result
}

// ── Persist result for the /sendcase monitoring page ────────────────────────

async function saveResult(db: ReturnType<typeof supabaseAdmin>, result: IntakeFillResult) {
  try {
    await db.from('intake_fill_jobs').upsert({
      contact_id:   result.contactId,
      contact_name: result.contactName,
      firm:         result.firm,
      status:       result.error ? 'error' : Object.keys(result.written).length > 0 ? 'completed' : 'no_data',
      fields_written:  result.written,
      fields_skipped:  result.skipped,
      fields_extracted: result.extracted,
      flags:        result.flags,
      summary:      result.summary,
      error:        result.error ?? null,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'contact_id' })
  } catch (err) {
    console.error('[intake-fill] Failed to save result', err)
  }
}
