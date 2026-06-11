import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { contactId, contactName, slot, totalCount, calledCount } = body

  if (!contactId || !slot) {
    return NextResponse.json({ error: 'Missing contactId or slot' }, { status: 400 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const { error } = await admin
    .from('call_logs')
    .upsert(
      {
        contact_id: contactId,
        contact_name: contactName || null,
        worker_id: user.id,
        date: today,
        slot,
        called_at: new Date().toISOString(),
      },
      { onConflict: 'contact_id,worker_id,date,slot' }
    )

  if (error) {
    console.error('[todos/check] upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Record response time event + auto-score slow checkmarks
  try {
    const { data: sighting } = await admin
      .from('nr_lead_sightings')
      .select('first_seen_at, opp_created_at')
      .eq('contact_id', contactId)
      .maybeSingle()

    if (sighting) {
      const baseline = sighting.opp_created_at || sighting.first_seen_at
      const responseSeconds = Math.round((Date.now() - new Date(baseline).getTime()) / 1000)
      const { data: prof } = await admin.from('profiles').select('name').eq('id', user.id).single()
      await admin.from('lead_response_events').insert({
        contact_id:         contactId,
        worker_id:          user.id,
        worker_name:        prof?.name || null,
        event_type:         'called',
        lead_first_seen_at: baseline,
        responded_at:       new Date().toISOString(),
        response_seconds:   responseSeconds,
      })

      // Auto-score: slow checkmark (>2 min) → -1 pt, once per contact per day
      if (responseSeconds > 120) {
        const mins = Math.floor(responseSeconds / 60)
        const secs = responseSeconds % 60
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
        const { count: existing } = await admin
          .from('score_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('event_type', 'slow_checkmark')
          .eq('date', today)
          .eq('note', `Late check: ${contactName || contactId}`)
        if ((existing ?? 0) === 0) {
          await admin.from('score_events').insert({
            user_id:        user.id,
            event_type:     'slow_checkmark',
            points:         -1,
            note:           `Late check: ${contactName || contactId} (${timeStr})`,
            date:           today,
            auto_generated: true,
          })
        }
      }
    }
  } catch {}

  // Auto-score: slot completed → +1 pt (once per slot per day)
  try {
    if (typeof totalCount === 'number' && typeof calledCount === 'number' &&
        totalCount > 0 && (calledCount + 1) >= totalCount) {
      const slotKey = `${slot}`
      const { count: existing } = await admin
        .from('score_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_type', 'todo_complete')
        .eq('date', today)
        .ilike('note', `%${slotKey}%`)
      if ((existing ?? 0) === 0) {
        const slotLabel = slot === 'morning' ? 'Morning' : slot === 'afternoon' ? 'Afternoon' : 'Evening'
        await admin.from('score_events').insert({
          user_id:        user.id,
          event_type:     'todo_complete',
          points:         1,
          note:           `All ${slotLabel} leads called`,
          date:           today,
          auto_generated: true,
        })
      }
    }
  } catch {}

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contactId')
  const slot = searchParams.get('slot')

  if (!contactId || !slot) {
    return NextResponse.json({ error: 'Missing contactId or slot' }, { status: 400 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const { error } = await admin
    .from('call_logs')
    .delete()
    .eq('contact_id', contactId)
    .eq('worker_id', user.id)
    .eq('date', today)
    .eq('slot', slot)

  if (error) {
    console.error('[todos/check] delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
