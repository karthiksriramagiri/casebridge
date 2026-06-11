import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSlack } from '@/lib/slack'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { moduleId, tabLeaveCount } = await req.json()

  const [profileRes, moduleRes] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', user.id).single(),
    supabase.from('modules').select('title').eq('id', moduleId).single(),
  ])

  const name = profileRes.data?.name || 'A rep'
  const moduleTitle = moduleRes.data?.title || 'Unknown module'

  await sendSlack({
    text: `🚨 ${name} left the tab during a quiz`,
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚨 *${name}* left the tab during a quiz\n*Module:* ${moduleTitle}\n*Tab leaves this attempt:* ${tabLeaveCount}`,
      },
    }],
  })

  return NextResponse.json({ ok: true })
}
