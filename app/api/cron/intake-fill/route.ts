import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runIntakeFill } from '@/app/dialer/_lib/intake-fill'

export const maxDuration = 120

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/cron/intake-fill
// Runs every 15 minutes via Vercel cron. Picks up pending intake-fill jobs
// whose scheduled_at has passed and processes them.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const now = new Date().toISOString()

  // Fetch pending jobs whose scheduled time has passed (max 10 per run)
  const { data: jobs, error } = await db
    .from('intake_fill_jobs')
    .select('id, contact_id, contact_name, firm')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[cron:intake-fill] query error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  console.log(`[cron:intake-fill] Processing ${jobs.length} pending jobs`)

  const results: Array<{ contactId: string; status: string }> = []

  for (const job of jobs) {
    // Mark as processing
    await db.from('intake_fill_jobs')
      .update({ status: 'processing' })
      .eq('id', job.id)

    try {
      const result = await runIntakeFill(job.contact_id)
      results.push({
        contactId: job.contact_id,
        status: result.error ? 'error' : 'completed',
      })
    } catch (err: any) {
      console.error(`[cron:intake-fill] Failed for ${job.contact_id}`, err)
      await db.from('intake_fill_jobs')
        .update({
          status: 'error',
          error: err.message ?? 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      results.push({ contactId: job.contact_id, status: 'error' })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
