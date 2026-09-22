// Shared function — called from transcript-callback after each completed transcript.
// Fetches all available data for a contact and generates a bullet-point summary via Claude Haiku.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { GHL_BASE, ghlHeaders, CF_LABELS } from '@/app/dialer/_lib/ghl-fields'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
