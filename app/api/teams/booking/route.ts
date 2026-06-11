import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'
import { format } from 'date-fns'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 12 * 60 * 60 * 1000)

  // Fetch all booked slots in the window, plus this user's booking
  const [{ data: bookedRows }, { data: myBooking }] = await Promise.all([
    supabase
      .from('bookings')
      .select('slot_time')
      .gte('slot_time', now.toISOString())
      .lte('slot_time', windowEnd.toISOString()),
    supabase
      .from('bookings')
      .select('slot_time')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  return NextResponse.json({
    bookedSlots: (bookedRows ?? []).map((r) => r.slot_time),
    myBooking: myBooking?.slot_time ?? null,
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slotTime } = await req.json()
  if (!slotTime) return NextResponse.json({ error: 'slotTime required' }, { status: 400 })

  const slot = new Date(slotTime)
  const now = new Date()
  const earliest = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const latest = new Date(now.getTime() + 12 * 60 * 60 * 1000)

  if (slot < earliest || slot > latest) {
    return NextResponse.json({ error: 'Slot outside allowed window' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()
  const userName = profile?.name || 'A rep'

  // Delete any existing booking for this user, then insert new one
  await supabase.from('bookings').delete().eq('user_id', user.id)

  const { error } = await supabase.from('bookings').insert({
    user_id: user.id,
    slot_time: slot.toISOString(),
  })

  if (error) {
    // UNIQUE violation on slot_time = already taken
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That slot was just taken. Please pick another.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const slotLabel = format(slot, "EEEE, MMMM d 'at' h:mm a")

  await sendSlack({
    text: `📅 ${userName} booked an onboarding call`,
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📅 *${userName}* booked an onboarding call\n*Slot:* ${slotLabel}`,
      },
    }],
  })

  return NextResponse.json({ ok: true, slotTime: slot.toISOString() })
}
