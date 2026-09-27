import { NextRequest, NextResponse } from 'next/server'
import { venuAdmin } from '@/app/venu/_lib/auth'
import {
  QUALIFICATION_QUESTIONS, REQUIRED_KEYS, candidateIsComplete, INTERVIEW_BUCKET, normalizePhone,
} from '@/app/venu/_lib/candidates'
import { notifyNewSubmission } from '@/app/venu/_lib/candidate-notify'

/* The candidate's own view of their application. Public, keyed by the token
   they were given at signup — so it returns that one row and nothing else. */

function publicView(row: any) {
  return {
    name:         row.name,
    email:        row.email,
    phone:        row.phone,
    status:       row.status,
    answers:      row.answers ?? {},
    recordings:   row.recordings ?? {},
    submittedAt:  row.submitted_at,
    reviewNote:   row.review_note,
    whatsappGroupUrl: row.whatsapp_group_url,
    teamLoginEmail:   row.team_login_email,
    questions:    QUALIFICATION_QUESTIONS,
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const db = venuAdmin()
  const { data } = await db.from('venu_candidates').select('*').eq('token', token).maybeSingle()
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ candidate: publicView(data) })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const db = venuAdmin()

  const { data: row } = await db.from('venu_candidates').select('*').eq('token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Once a decision has been made the application is closed to further edits.
  if (['qualified', 'not_qualified', 'onboarded'].includes(row.status)) {
    return NextResponse.json({ candidate: publicView(row), locked: true })
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  /* The closing question: "can you please share your phone number so we can
     send you the instructions?" — the last thing the interview asks. */
  if (body.phone !== undefined) {
    const phone = normalizePhone(String(body.phone ?? ''))
    if (!phone) {
      return NextResponse.json({ error: 'That number does not look right. Include your country code.' }, { status: 400 })
    }
    updates.phone = phone
  }

  if (body.answers && typeof body.answers === 'object') {
    const clean: Record<string, string> = {}
    for (const q of QUALIFICATION_QUESTIONS) {
      const v = body.answers[q.key]
      if (v == null) continue
      clean[q.key] = String(v).slice(0, 2000)
    }
    updates.answers = { ...(row.answers ?? {}), ...clean }
    if (clean.role) updates.role_applied = clean.role
  }

  /* The recording is uploaded straight to storage with a signed URL, so the
     browser tells us where it landed. Trust it only as far as checking the
     object is really there under this candidate's own prefix. */
  if (body.recordingPath) {
    const path = String(body.recordingPath)
    if (!path.startsWith(`${row.id}/`)) {
      return NextResponse.json({ error: 'bad_path' }, { status: 400 })
    }
    const { data: listed } = await db.storage.from(INTERVIEW_BUCKET).list(row.id, { limit: 100 })
    const file = (listed ?? []).find(f => `${row.id}/${f.name}` === path)
    if (!file) return NextResponse.json({ error: 'upload_not_found' }, { status: 400 })

    updates.recording_path = path
    updates.recording_name = String(body.recordingName ?? file.name).slice(0, 260)
    updates.recording_size = (file as any).metadata?.size ?? null
  }

  const merged = { ...row, ...updates }
  const complete = candidateIsComplete(merged)
  const justSubmitted = complete && row.status === 'invited'
  if (justSubmitted) {
    updates.status = 'submitted'
    updates.submitted_at = new Date().toISOString()
  }

  const { data: saved, error } = await db.from('venu_candidates')
    .update(updates).eq('id', row.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Slack only once, on the transition into the review queue.
  if (justSubmitted) await notifyNewSubmission(saved)

  return NextResponse.json({
    candidate: publicView(saved),
    missing: REQUIRED_KEYS.filter(k => !String((saved.answers ?? {})[k] ?? '').trim()),
  })
}
