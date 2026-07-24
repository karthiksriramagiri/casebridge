import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAISummary } from '../../ai-summary/generate'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Deepgram POSTs the completed transcript here.
export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const transcriptId = searchParams.get('transcriptId') ?? ''
  const callSid      = searchParams.get('callSid') ?? ''

  const data = await req.json()
  console.log('[dialer:transcript-callback] received for callSid', callSid)

  // Build utterances from multichannel results
  // Deepgram multichannel: results.channels[n].alternatives[0].words
  // We flatten all words across channels into utterances sorted by start time,
  // labelling channel 0 as "Agent" and channel 1 as "Lead"
  const channels: any[] = data?.results?.channels ?? []
  const LABELS: Record<number, string> = { 0: 'Agent', 1: 'Lead' }

  // Build word-level array across all channels
  const allWords: Array<{ start: number; end: number; word: string; channel: number }> = []
  channels.forEach((ch: any, idx: number) => {
    const words = ch?.alternatives?.[0]?.words ?? []
    words.forEach((w: any) => {
      allWords.push({ start: w.start, end: w.end, word: w.punctuated_word ?? w.word, channel: idx })
    })
  })
  allWords.sort((a, b) => a.start - b.start)

  // Group consecutive words from the same channel into utterances
  const utterances: Array<{ speaker: string; start: number; end: number; transcript: string }> = []
  let current: typeof utterances[0] | null = null
  for (const w of allWords) {
    const speaker = LABELS[w.channel] ?? `Channel ${w.channel}`
    if (!current || current.speaker !== speaker || w.start - current.end > 1.5) {
      if (current) utterances.push(current)
      current = { speaker, start: w.start, end: w.end, transcript: w.word }
    } else {
      current.transcript += ' ' + w.word
      current.end = w.end
    }
  }
  if (current) utterances.push(current)

  // Build plain text summary
  const fullText = utterances.map(u => `${u.speaker}: ${u.transcript}`).join('\n')

  // Fetch contact_id from the call row
  const db = supabaseAdmin()
  const { data: callRow } = await db
    .from('dialer_calls')
    .select('contact_id')
    .eq('call_sid', callSid)
    .single()

  // Extract Deepgram's built-in summary (from summarize=v2 param)
  const dgSummary: string = data?.results?.summary?.short ?? ''

  await db.from('dialer_transcripts').update({
    status:       'completed',
    full_text:    fullText,
    utterances:   utterances,
    summary:      dgSummary || null,
    raw:          data,
    contact_id:   callRow?.contact_id ?? null,
    completed_at: new Date().toISOString(),
  }).eq('id', transcriptId)

  console.log('[dialer:transcript-callback] stored', utterances.length, 'utterances for', callSid)

  // Auto-generate AI summary for this contact (non-blocking)
  const contactId = callRow?.contact_id
  if (contactId) {
    generateAISummary(contactId).catch(err =>
      console.error('[dialer:transcript-callback] ai-summary error', err)
    )
  }

  return new NextResponse(null, { status: 200 })
}
