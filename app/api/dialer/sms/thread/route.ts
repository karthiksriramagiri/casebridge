import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/dialer/sms/thread?phone=+1...
// Returns all messages with a specific lead phone number, marks inbound as read
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const phone = searchParams.get('phone') ?? ''

  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: messages, error } = await db
    .from('dialer_messages')
    .select('*')
    .or(`from_number.eq.${phone},to_number.eq.${phone}`)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark all inbound messages from this number as read
  await db
    .from('dialer_messages')
    .update({ read: true })
    .eq('from_number', phone)
    .eq('direction', 'inbound')
    .eq('read', false)

  return NextResponse.json({ messages: messages ?? [] })
}
