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

  // Build utterances from Deepgram results.
  // Dual-channel (conference recordings): channels[0] = Agent (rep), channels[1] = Lead (customer)
  // Mono (fallback with diarize): words have speaker IDs, mapped to Agent/Lead
  const channels: any[] = data?.results?.channels ?? []
  const isMultichannel = channels.length >= 2

  const CHANNEL_LABELS: Record<number, string> = { 0: 'Agent', 1: 'Lead' }

  const allWords: Array<{ start: number; end: number; word: string; speaker: string }> = []

  if (isMultichannel) {
    // Multichannel: words come from separate channels
    channels.forEach((ch: any, idx: number) => {
      const words = ch?.alternatives?.[0]?.words ?? []
      words.forEach((w: any) => {
        allWords.push({ start: w.start, end: w.end, word: w.punctuated_word ?? w.word, speaker: CHANNEL_LABELS[idx] ?? `Channel ${idx}` })
      })
    })
  } else {
    // Mono with diarization: words have speaker IDs (0, 1, ...)
    const words = channels[0]?.alternatives?.[0]?.words ?? []
    words.forEach((w: any) => {
      const spkId = w.speaker ?? 0
      allWords.push({ start: w.start, end: w.end, word: w.punctuated_word ?? w.word, speaker: spkId === 0 ? 'Agent' : 'Lead' })
    })
  }
  allWords.sort((a, b) => a.start - b.start)

  // Group consecutive words from the same speaker into utterances
  const utterances: Array<{ speaker: string; start: number; end: number; transcript: string }> = []
  let current: typeof utterances[0] | null = null
  for (const w of allWords) {
    if (!current || current.speaker !== w.speaker || w.start - current.end > 1.5) {
      if (current) utterances.push(current)
      current = { speaker: w.speaker, start: w.start, end: w.end, transcript: w.word }
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
