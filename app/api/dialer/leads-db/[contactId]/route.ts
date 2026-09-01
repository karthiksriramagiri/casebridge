import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/dialer/leads-db/[contactId]
// Returns all calls and transcripts for a contact
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const { contactId } = await params
  const db = supabaseAdmin()

  // Fetch calls, transcripts, AI summary, and checklists in parallel
  const [
    { data: calls, error: callsErr },
    { data: aiRow },
    { data: checklists },
  ] = await Promise.all([
    db
      .from('dialer_calls')
      .select('call_sid, call_status, disposition, duration, started_at, ended_at, recording_url, rep_identity, firm, stage_name, campaign_id, phone, contact_name')
      .eq('contact_id', contactId)
      .order('started_at', { ascending: false }),
    db
      .from('dialer_ai_summaries')
      .select('summary, updated_at')
      .eq('contact_id', contactId)
      .single(),
    db
      .from('dialer_call_checklist')
      .select('call_sid, checklist, rep_identity, updated_at')
      .eq('contact_id', contactId),
  ])

  if (callsErr) {
    return NextResponse.json({ error: callsErr.message }, { status: 500 })
  }

  // Fetch transcripts for all calls
  const callSids = (calls ?? []).map(c => c.call_sid)
  let transcripts: any[] = []
  if (callSids.length > 0) {
    const { data: txData } = await db
      .from('dialer_transcripts')
      .select('id, call_sid, status, full_text, summary, utterances, completed_at, provider')
      .in('call_sid', callSids)
      .order('completed_at', { ascending: false })
    transcripts = txData ?? []
  }

  // Group transcripts by call_sid
  const txBySid: Record<string, any[]> = {}
  for (const tx of transcripts) {
    if (!txBySid[tx.call_sid]) txBySid[tx.call_sid] = []
    txBySid[tx.call_sid].push(tx)
  }

  // Index checklists by call_sid
  const clBySid: Record<string, any> = {}
  for (const cl of (checklists ?? [])) {
    clBySid[cl.call_sid] = cl.checklist
  }

  const callsWithTranscripts = (calls ?? []).map(c => ({
    ...c,
    transcripts: txBySid[c.call_sid] ?? [],
    checklist: clBySid[c.call_sid] ?? null,
  }))

  return NextResponse.json({
    calls: callsWithTranscripts,
    aiSummary: aiRow?.summary ?? null,
    aiUpdatedAt: aiRow?.updated_at ?? null,
  })
}
