// Shared function — called from transcript-callback after each completed transcript.
// Fetches all available data for a contact and generates a bullet-point summary via Claude Haiku.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const GHL_BASE    = 'https://services.leadconnectorhq.com'
const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function ghlHeaders() {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return { Authorization: `Bearer ${key}`, Version: '2021-07-28' }
}

// GHL custom field ID → label (same map as contacts route)
const CF_LABELS: Record<string, string> = {
  CquRmjr60UaEIjP9DD2F: 'Date of Accident',
  YKk0RFckpkrdvYTVVNkg: 'When Did Accident Happen',
  EwUs6rGuVeanDDP90agm: 'Accident State',
  '91X4LCiQ53bPjS52i0sg': 'City of Accident',
  ANMwrqQQmh1RcTr34HDC: 'Accident Location',
  '4FY0cD8CIVa85yPRFUDI': 'Estimated Time of Accident',
  hCnqQXqDrNKJs05Ddcm6: 'Injury Description',
  wwtqKVAfuc6cCCry1sPg: 'Injury Description (alt)',
  rgjapMT8juA3asip8zNl: 'Injuries Sustained',
  '5VwvlYSs6mUbidJTi8dt': 'Incident Notes',
  '5TGTevlEmHJ74SnDxRYh': 'Has Attorney?',
  u4Lay3oKulSMOwZilE3a: 'Worked With Law Firm?',
  s5WfL5WGmy99OgqaYpU9: 'Current Attorney / Firm',
  YtZUdIItzykXRn1RXCJn: 'Were You At Fault',
  uOv0RRRrEGgGo1eY1lp7: 'Were You At Fault? (alt)',
  '5yRuMLPI3s9YAYKt5xXy': 'Ambulance Involved',
  fakaJ96RTgbuv3lS8cnN: 'Vehicle Damaged?',
  mZRX8UhpoFh3qQxqbtDo: 'Were You Insured?',
  it3evcqCdkzSU0ubO1qn: 'Accepted Insurance Money?',
  NKTAnB2vDMMxs5BsEOJX: 'Vehicle Info',
  nHz4hxklQ5GhDE0KD1Jj: 'Vehicle Damage Description',
  ytrqG1b0D1BVXf0tPtaY: 'License Plate',
  u42ugUuWhr2NI64HW0uI: 'Vehicle Location',
  swvVdZRlyMpVxrO9sLsK: 'Passengers in Vehicle',
  TVyGWg5Ofpd1pUHTcAL2: 'Hospital / Facility',
  pxWLySNlVJrxySNsmUY3: 'Treatment Since Accident',
  hH9PxVS7xbpVqdXClUmU: 'Police Report #',
  zy3E3xzsezWpYfbyGnTW: 'Police Report Completed',
  JjOQB8FzbL3oWKTv87ge: "Client's Auto Insurance",
  KLl22odyp1f3TDs60zGh: "At-Fault Driver's Insurance",
  M9aUntlXM7l892OCoaUW: 'At-Fault Driver Info',
  YO3Pu5k1EK2q1cFFspnz: 'Witnesses / Video',
  dd7SAkCv7ffp1BnOsldH: "Client's Address",
  RA5qCQ7Eh9HKodl508vL: "Driver's License",
  tIy7Mj5kC1TnlyxEku5h: 'Emergency Contact',
  '6OVNq09HPO43c4Kijj5b': 'Parent/Guardian Name',
  SIqbCmbaNJW1HuZNOim4: 'Relationship to Client',
  ZmG154FohYzWRAFRuMnb: 'Reason Not Qualified',
  cRez6XhQX572JOE7rbep: 'Case Manager Appt Time',
  X6tTJYIWHS1PYiKQZxFq: 'PC Call Back Time',
  u4vacrNyMO0BvdrRkkMd: 'Closer',
  DTgEC1i5V7T5GiuwPVV7: 'Phone Line Type',
  MN6t73d2QXKnowN5uRAi: 'Phone Carrier',
  mUC78HfvlR4Gcpu77rY2: 'Phone Valid',
}

export async function generateAISummary(contactId: string): Promise<void> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.warn('[ai-summary] No ANTHROPIC_API_KEY — skipping')
    return
  }

  const db = supabaseAdmin()

  // Fetch GHL contact fields, transcripts, and SMS in parallel
  const [ghlRes, { data: transcripts }, { data: messages }] = await Promise.all([
    fetch(`${GHL_BASE}/contacts/${contactId}`, {
      headers: ghlHeaders(),
      cache: 'no-store',
    }),
    db
      .from('dialer_transcripts')
      .select('full_text, completed_at')
      .eq('contact_id', contactId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: true }),
    db
      .from('dialer_messages')
      .select('direction, body, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true }),
  ])

  // Build context string
  const sections: string[] = []

  // GHL case fields
  if (ghlRes.ok) {
    const ghlData = await ghlRes.json()
    const c = ghlData.contact ?? ghlData
    const fields: string[] = []
    for (const cf of c.customFields ?? []) {
      const label = CF_LABELS[cf.id]
      const value = cf.value ?? cf.fieldValue
      if (label && value !== null && value !== undefined && String(value).trim() !== '') {
        fields.push(`${label}: ${value}`)
      }
    }
    if (fields.length > 0) {
      sections.push(`INTAKE FORM FIELDS:\n${fields.join('\n')}`)
    }
  }

  // Call transcripts
  if (transcripts && transcripts.length > 0) {
    const txText = transcripts.map((tx, i) =>
      `Call ${i + 1} (${tx.completed_at ? new Date(tx.completed_at).toLocaleDateString() : 'unknown date'}):\n${tx.full_text}`
    ).join('\n\n')
    sections.push(`CALL TRANSCRIPTS:\n${txText}`)
  }

  // SMS messages
  if (messages && messages.length > 0) {
    const smsText = messages.map(m =>
      `${m.direction === 'inbound' ? 'Lead' : 'Rep'}: ${m.body}`
    ).join('\n')
    sections.push(`SMS MESSAGES:\n${smsText}`)
  }

  if (sections.length === 0) {
    console.log('[ai-summary] no data to summarize for', contactId)
    return
  }

  const prompt = `You are summarizing a personal injury lead for a law firm intake team.

Based on the information below, write a concise bullet-point summary of what is known about this lead's case. Include details from the intake form AND anything discussed in calls or texts. Do not include headers, sections, or labels — just plain bullet points starting with "•". Keep each bullet short and factual.

${sections.join('\n\n---\n\n')}`

  try {
    const client = new Anthropic({ apiKey: anthropicKey })
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    })

    const summary = (msg.content[0] as any)?.text?.trim() ?? ''
    if (!summary) return

    // Upsert into dialer_ai_summaries (one row per contact)
    await db.from('dialer_ai_summaries').upsert({
      contact_id: contactId,
      summary,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'contact_id' })

    console.log('[ai-summary] stored for', contactId)
  } catch (err) {
    console.error('[ai-summary] Claude error', err)
  }
}
