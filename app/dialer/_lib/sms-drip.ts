// SMS drip automation — 21-day cold outreach sequence (AM + PM).
// Triggered on first "No Answer" disposition, cancelled when a PC replies.

import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Cold outreach templates (ported from sms-bot) ────────────────────────────
// [NAME] is replaced with the lead's first name at schedule time.

const COLD_TEMPLATES: Record<string, string> = {
  day_1_am: "Hi [NAME]! 👋👋 It's William from Accident Support Desk, I was looking over your accident info and it looks very similar to another accident we just settled for a pretty significant amount. I think we can help show you how to do the same, just had a few quick questions for us to understand the situation a bit better. We can handle this over text message real quick, should only take a minute. Do you remember the date of the accident?",
  day_1_pm: "Hey [NAME] 🤕 waiting any longer could actually hurt your claim. I want to make sure you get a clear picture of your compensation options. I only need one quick detail to start. What was the date of the accident?",
  day_2_am: "Hi [NAME] 👋, William here. I know getting a message out of nowhere feels weird but I genuinely think you might be sitting on more than you realize. People in accidents like yours often don't know what they qualify for until someone walks them through it. What was the date of the accident?",
  day_2_pm: "William from Accident Support Desk here. Some of what you shared looks like the insurance company may already be using tactics against you. I can help you get ahead of it, just need one detail. What was the date of the accident?",
  day_3_am: "Hey [NAME] 🤔, quick honest question. Has the other driver's insurance reached out to you yet? If they have, there's a reason for that and it's not in your favor. I can explain what's happening on their end. Just need to know, were you at fault?",
  day_3_pm: "Hey [NAME]! it's William. Based on the info you gave, there might be some injury-related protections you qualify for if we act quickly. I can check for you real fast. What was the date of the accident?",
  day_4_am: "Hi [NAME], it's William. I've been doing this long enough to know that the people who wait the longest usually end up with the least. Not trying to scare you just being honest. Did you need to see a doctor after the accident at all?",
  day_4_pm: "Hi [NAME], William again. I noticed you might be missing out on lost wage compensation it's something people often overlook. A couple quick questions will tell us for sure. What was the date of the accident?",
  day_5_am: "Hey [NAME] 👋 William here. Were there any passengers in your car when the accident happened? That detail actually matters more than most people think for how a claim gets valued.",
  day_5_pm: "Hi [NAME], it's William. Just thinking, even if you feel mostly okay physically, there can be things that show up later that you'd want documented now. Did you have any pain or soreness after the accident, even minor?",
  day_6_am: "Hey [NAME], William from Accident Support Desk. I still have your file open and I keep coming back to it. What was the date of the accident?",
  day_6_pm: "[NAME], no pressure here at all. I just don't want you looking back in 6 months wishing you'd asked. Were you at fault for the accident?",
  day_7_am: "Hey [NAME], William here. Haven't heard back so I wasn't sure if you still wanted help with the accident stuff. If you do, what was the date of the accident?",
  day_7_pm: "Hi [NAME], wrapping up the week and still have your file open. Were you injured in the accident at all, even something that seemed minor at the time?",
  day_8_am: "Hey [NAME] ⏳, William here. New week, wanted to start fresh. There's a legal deadline on accident claims and once it passes there's nothing I or anyone else can do for you. What was the date of your accident so I can check where you stand?",
  day_8_pm: "Hi [NAME], William from Accident Support Desk. There's a chance you may qualify for compensation most people don't even know exists in situations like yours. I just need a quick detail to double-check. What was the date of the accident?",
  day_9_am: "[NAME], real talk. Insurance companies have entire teams whose job is to pay you as little as possible. I'm on the other side of that. I want to make sure you're not walking away from something you're actually owed. Were you at fault for the accident?",
  day_9_pm: "[NAME]!, William here, I'm looking at your file and you might qualify for additional property damage support depending on the timeline. Quick question: what was the date of the accident?",
  day_10_am: "Hi [NAME], it's William. Something I haven't asked yet, was there a police report filed after your accident? That one detail can make a big difference in what you're able to claim.",
  day_10_pm: "Hi [NAME], it's William. I know things get hectic, but I didn't want you to miss out on the help you might qualify for. Can you send me the date of the accident real quick?",
  day_11_am: "Hey [NAME] 💰, I'll be straight with you. I've seen people in similar situations get $40k, $80k, even more. I've also seen people get nothing because they waited too long. I'd hate for that to be you. What was the date of the accident?",
  day_11_pm: "Hi [NAME], William here. Did the accident affect you emotionally at all, anxiety driving, trouble sleeping, anything like that? That's actually compensable and most people never think to mention it.",
  day_12_am: "[NAME], William from Accident Support Desk. Quick thing, was anyone else injured in the accident? Not just you, but any passengers or the other driver? Helps me understand the full picture.",
  day_12_pm: "Hey [NAME] ❤️, I genuinely hope you're doing okay. Accidents take more out of people than they realize, physically and mentally. If you want to explore your options, I'm still here. Just reply with the date of the accident.",
  day_13_am: "Hi [NAME], it's William. I've been in this field a long time and I can tell when a case has real potential. Yours does. But I can only help if you respond. What was the date of the accident?",
  day_13_pm: "[NAME], one thing I haven't mentioned: even if you already settled something small with insurance, you may still have options. Did you sign anything with the insurance company after the accident?",
  day_14_am: "Hey [NAME], William here. I'll stop reaching out if you don't feel like you need guidance with your case value anymore. Did you still want some help, or should I close your file?",
  day_14_pm: "Hi [NAME], it's William. Two weeks in and I keep coming back to your file. I'd rather ask one more time than not. What was the date of the accident?",
  day_15_am: "Hey [NAME] 👋, William here. Starting week three, I know that's a lot of messages. I wouldn't keep going if I didn't genuinely think this was worth your time. Were you at fault for the accident?",
  day_15_pm: "[NAME], no guilt if you're not interested, I promise. I just want to make sure you made that choice knowingly and not because life got in the way. Still open to helping if you want it.",
  day_16_am: "Hi [NAME], William again. I've reached out a few times and wasn't sure if you were still needing help with everything going on.",
  day_16_pm: "Hey [NAME], did you ever wonder what your accident claim might actually be worth? Most people assume it's not much. They're usually wrong. I can give you a rough idea in literally two questions.",
  day_17_am: "Hi [NAME], William here. I've worked with a lot of people who were skeptical at first, thought nothing would come of it. A lot of them were really glad they responded. What was the date of your accident?",
  day_17_pm: "[NAME], I'm not going to pretend I'm not following up again. I am. Because I've seen what happens when people act and when they don't. Were you injured at all?",
  day_18_am: "Hey [NAME], William here. Before I stop reaching out I wanted to check one last time, some timelines in accident cases really do matter. What was the date of the accident?",
  day_18_pm: "Hi [NAME], it's William. If you already got help, or you're just not interested, just let me know either way and I'll stop reaching out. No hard feelings at all.",
  day_19_am: "[NAME] 🙏, William from Accident Support Desk. I keep thinking about this: people who've been in accidents are already dealing with enough. So I'll make it simple: yes or no, do you want me to take a look at your situation?",
  day_19_pm: "Hey [NAME], most people who don't respond aren't uninterested, life just gets busy. If that's you, I get it. I'm still here when you have a minute.",
  day_20_am: "Hi [NAME], William here. I've got a few cases I'm wrapping up this week and yours has been on my mind. What was the date of the accident?",
  day_20_pm: "[NAME], I've been doing this a long time. I've seen people get help they never expected and I've seen people miss out entirely. One last real push from me, were you at fault for the accident?",
  day_21_am: "Hey [NAME] 💬, it's William. I've reached out every day for three weeks because I believed there was something worth fighting for in your file. I still do. If you want help, I'm here. If not, I'll stop, no hard feelings. Just reply yes or no.",
  day_21_pm: "Hey [NAME], it's William. This will be my last message so I don't keep bothering you. Before I close out your file, let me know if you still wanted some help. Just needed to confirm a few details.",
}

// ── Scheduling ───────────────────────────────────────────────────────────────

function firstNameFrom(full: string | null): string {
  if (!full) return 'there'
  return full.split(' ')[0] || 'there'
}

/**
 * Schedule the full 21-day cold outreach drip for a contact.
 * AM messages go out at 10:00 AM ET, PM messages at 6:00 PM ET.
 */
export async function scheduleDrip(contact: {
  contactId:   string
  contactName: string | null
  phone:       string
  firm:        string | null
}): Promise<number> {
  const db = supabaseAdmin()
  const name = firstNameFrom(contact.contactName)
  const now = new Date()

  const rows: Array<{
    contact_id:   string
    contact_name: string | null
    phone:        string
    firm:         string | null
    template_key: string
    message:      string
    status:       string
    scheduled_at: string
  }> = []

  for (let day = 1; day <= 21; day++) {
    for (const slot of ['am', 'pm'] as const) {
      const key = `day_${day}_${slot}`
      const template = COLD_TEMPLATES[key]
      if (!template) continue

      // AM = 10:00 ET, PM = 18:00 ET
      const hour = slot === 'am' ? 10 : 18
      const sendDate = new Date(now)
      sendDate.setDate(sendDate.getDate() + (day - 1))

      // Build ET time: use America/New_York
      const etString = sendDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD
      const scheduledAt = new Date(`${etString}T${String(hour).padStart(2, '0')}:00:00-04:00`) // ET offset

      // Skip if already in the past
      if (scheduledAt <= now) continue

      const message = template.replace(/\[NAME\]/g, name)

      rows.push({
        contact_id:   contact.contactId,
        contact_name: contact.contactName,
        phone:        contact.phone,
        firm:         contact.firm,
        template_key: key,
        message,
        status:       'pending',
        scheduled_at: scheduledAt.toISOString(),
      })
    }
  }

  if (rows.length === 0) return 0

  await db.from('dialer_sms_drip').insert(rows)

  // Mark automation as active
  await db.from('dialer_lead_state').upsert({
    contact_id:         contact.contactId,
    sms_drip_active:    true,
    sms_drip_started_at: now.toISOString(),
    updated_at:         now.toISOString(),
  }, { onConflict: 'contact_id' })

  console.log(`[sms-drip] scheduled ${rows.length} messages for ${contact.contactId}`)
  return rows.length
}

/**
 * Cancel all pending drip messages for a contact (PC replied manually).
 */
export async function cancelDrip(contactId: string): Promise<void> {
  const db = supabaseAdmin()
  const now = new Date().toISOString()

  const { count } = await db
    .from('dialer_sms_drip')
    .update({ status: 'cancelled', cancelled_at: now })
    .eq('contact_id', contactId)
    .eq('status', 'pending')

  await db.from('dialer_lead_state').update({
    sms_drip_active: false,
    updated_at:      now,
  }).eq('contact_id', contactId)

  console.log(`[sms-drip] cancelled ${count ?? 0} pending messages for ${contactId}`)
}

/**
 * Check if a contact already has drip automation (active or previously ran).
 */
export async function hasDripHistory(contactId: string): Promise<boolean> {
  const db = supabaseAdmin()
  const { count } = await db
    .from('dialer_sms_drip')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
  return (count ?? 0) > 0
}
