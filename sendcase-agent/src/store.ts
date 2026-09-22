// Supabase access. Writing to intake_fill_jobs is what makes the /sendcase
// page update — the page already reads this table, so the agent marking a job
// complete is the whole "update /sendcases" requirement.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }
    client = createClient(url, key)
  }
  return client
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'error' | 'no_data'

export interface JobRecord {
  contactId: string
  contactName?: string | null
  firm?: string | null
  status: JobStatus
  fieldsWritten?: Record<string, string>
  fieldsSkipped?: Record<string, string>
  fieldsExtracted?: Record<string, string>
  flags?: string[]
  summary?: string | null
  error?: string | null
}

export async function markProcessing(
  contactId: string,
  contactName?: string | null,
  firm?: string | null
): Promise<void> {
  await db()
    .from('intake_fill_jobs')
    .upsert(
      {
        contact_id: contactId,
        contact_name: contactName ?? null,
        firm: firm ?? null,
        status: 'processing' as JobStatus,
        error: null,
        scheduled_at: new Date().toISOString(),
      },
      { onConflict: 'contact_id' }
    )
}

export async function saveJob(rec: JobRecord): Promise<void> {
  await db()
    .from('intake_fill_jobs')
    .upsert(
      {
        contact_id: rec.contactId,
        contact_name: rec.contactName ?? null,
        firm: rec.firm ?? null,
        status: rec.status,
        fields_written: rec.fieldsWritten ?? {},
        fields_skipped: rec.fieldsSkipped ?? {},
        fields_extracted: rec.fieldsExtracted ?? {},
        flags: rec.flags ?? [],
        summary: rec.summary ?? null,
        error: rec.error ?? null,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'contact_id' }
    )
}

// Has this contact already been filled? Used by the backfill sweep so a rerun
// doesn't redo completed work (or spend GHL quota re-reading it).
export async function alreadyCompleted(contactId: string): Promise<boolean> {
  const { data } = await db()
    .from('intake_fill_jobs')
    .select('status')
    .eq('contact_id', contactId)
    .maybeSingle()
  return data?.status === 'completed'
}

// ── Evidence the dialer already collected ───────────────────────────────────

export interface Transcript {
  full_text: string | null
  completed_at: string | null
}

export async function getTranscripts(contactId: string): Promise<Transcript[]> {
  const { data } = await db()
    .from('dialer_transcripts')
    .select('full_text, completed_at')
    .eq('contact_id', contactId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: true })
  return (data ?? []) as Transcript[]
}

export interface StoredMessage {
  direction: string | null
  body: string | null
  created_at: string | null
}

export async function getStoredMessages(contactId: string): Promise<StoredMessage[]> {
  const { data } = await db()
    .from('dialer_messages')
    .select('direction, body, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
  return (data ?? []) as StoredMessage[]
}
