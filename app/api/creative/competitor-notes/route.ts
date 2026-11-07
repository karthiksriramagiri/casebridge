import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/* Dated competitor observations.

   One row per competitor per day: writing the same day twice is an edit, not
   a second note, which is what the unique index enforces and what upsert
   relies on. Everything is returned in one request — the page shows every
   competitor side by side, and a request each would only buy a way for them
   to disagree about what day it is. */

const MISSING = (m: string) =>
  /could not find the table/i.test(m) || /relation .* does not exist/i.test(m)

const SETUP =
  'Run supabase/migration_creative_competitor_notes.sql in the Supabase SQL editor to create the notes table.'

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const day = (v: unknown) => {
  const s = String(v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export async function GET(req: NextRequest) {
  const s = db()
  if (!s) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })

  /* Bounded rather than unbounded: the page shows a window of recent days,
     and a competitor noted every day for two years is not a page anyone
     wants to load at once. */
  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '60', 10) || 60, 7), 365)
  const since = new Date()
  since.setDate(since.getDate() - (days - 1))

  const { data, error } = await s
    .from('creative_competitor_notes')
    .select('id, competitor, note_date, body, author, updated_at')
    .gte('note_date', since.toISOString().slice(0, 10))
    .order('note_date', { ascending: false })
    .limit(2000)

  if (error) {
    if (MISSING(error.message)) return NextResponse.json({ notes: [], setupNeeded: true, error: SETUP })
    return NextResponse.json({ notes: [], error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    notes: (data ?? []).map((r) => ({
      id: r.id,
      competitor: r.competitor,
      date: String(r.note_date).slice(0, 10),
      body: r.body ?? '',
      author: r.author ?? null,
      updatedAt: r.updated_at,
    })),
    setupNeeded: false,
    error: null,
  })
}

export async function PUT(req: NextRequest) {
  const s = db()
  if (!s) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })

  const b = await req.json().catch(() => ({}))
  const competitor = String(b.competitor ?? '').trim()
  const date = day(b.date)
  const body = String(b.body ?? '')

  if (!competitor || !date) {
    return NextResponse.json({ error: 'competitor and a yyyy-mm-dd date are required.' }, { status: 400 })
  }

  /* An emptied note is deleted rather than stored blank — a day with nothing
     to say should not appear in the history as if it did. */
  if (body.trim() === '') {
    const { error } = await s.from('creative_competitor_notes').delete().eq('competitor', competitor).eq('note_date', date)
    if (error && !MISSING(error.message)) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }

  const { data, error } = await s
    .from('creative_competitor_notes')
    .upsert({ competitor, note_date: date, body, author: b.author ?? null }, { onConflict: 'competitor,note_date' })
    .select('id, competitor, note_date, body, author, updated_at')
    .single()

  if (error) {
    if (MISSING(error.message)) return NextResponse.json({ error: SETUP, setupNeeded: true }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    note: { id: data.id, competitor: data.competitor, date: String(data.note_date).slice(0, 10), body: data.body, author: data.author, updatedAt: data.updated_at },
  })
}
