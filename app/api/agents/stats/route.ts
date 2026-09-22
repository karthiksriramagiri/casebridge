import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Stats for the /agents floor. Reads intake_fill_jobs only — Supabase, never
// GHL — so this page is free to leave open.
export async function GET() {
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await db
      .from('intake_fill_jobs')
      .select('status, fields_written, completed_at')

    if (error) return NextResponse.json({ error: error.message })

    const rows = data ?? []
    const today = new Date().toISOString().slice(0, 10)

    let filledToday = 0
    let awaitingReview = 0
    let totalFilled = 0
    let fieldsFilled = 0

    for (const r of rows) {
      const written = (r.fields_written ?? {}) as Record<string, unknown>
      const count = typeof written === 'object' ? Object.keys(written).length : 0
      if (r.status === 'completed') {
        totalFilled++
        fieldsFilled += count
        awaitingReview++
        if ((r.completed_at ?? '').slice(0, 10) === today) filledToday++
      }
    }

    return NextResponse.json({ filledToday, awaitingReview, totalFilled, fieldsFilled })
  } catch (err: any) {
    // Never break the page over a stats panel.
    return NextResponse.json({ error: String(err) })
  }
}
