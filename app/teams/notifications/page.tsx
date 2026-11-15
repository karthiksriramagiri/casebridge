'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TeamsShell from '@/app/teams/dashboard/TeamsShell'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'

const notifications = [
  {
    id: 'certification',
    date: 'Jun 15, 2026',
    tag: 'Required',
    tagColor: 'red' as const,
    icon: '🏆',
    title: 'Case Bridge Operator Certification',
    summary: 'Every caller must pass the Nuance Certification and Jason\'s Final Mock Call before being assigned live leads.',
    sections: [
      {
        heading: 'Overview',
        content: (
          <p className="text-sm text-foreground/90 leading-relaxed">
            To become eligible for live leads, every caller must pass the <strong>Case Bridge Nuance Certification</strong> and <strong>Jason&rsquo;s Final Mock Call Certification</strong>.
          </p>
        ),
      },
      {
        heading: '📆 Schedule',
        content: (
          <div className="space-y-4">
            {[
              {
                day: 'Day 1', title: 'Nuance Certification Study Day', paid: true,
                items: [
                  'Read the full Nuances Book.',
                  'Prepare for Day 2 group exam.',
                  'Submit study confirmation before end of shift.',
                  'Recommended: submit 10 key notes + 3 questions / confusing scenarios.',
                ],
              },
              {
                day: 'Day 2', title: 'Group Exam Day', paid: true,
                items: [
                  'Live group exam via Google Meet — screen share required.',
                  'PASS exam → move immediately to Jason\'s Final Mock Call.',
                  'PASS mock call → Active Representative.',
                  'FAIL mock call → clock out immediately → unpaid retraining.',
                  'FAIL exam → clock out → unpaid study → re-exam on Day 3.',
                  'Mock call: 3 total attempts. Fail 3rd = termination.',
                ],
              },
              {
                day: 'Day 3', title: 'Group Re-Exam Day (failed exam only)', paid: false,
                items: [
                  'Only for reps who failed Day 2\'s written exam.',
                  'PASS re-exam → Jason\'s Final Mock Call (same rules apply).',
                  'FAIL re-exam → Immediate termination.',
                ],
              },
            ].map(({ day, title, paid, items }) => (
              <div key={day} className="border border-border rounded-xl overflow-hidden">
                <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded">{day}</span>
                    <span className="text-sm font-semibold text-foreground">{title}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${paid ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {paid ? 'PAID' : 'UNPAID'}
                  </span>
                </div>
                <ul className="px-4 py-3 space-y-1.5">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-sm text-foreground/90">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ),
      },
      {
        heading: '🏆 Certification Levels',
        content: (
          <div className="space-y-3">
            {[
              {
                level: 'A', title: 'Fast Track Certified', color: 'amber',
                req: ['Written exam: 90%+', 'Passed mock call on first attempt'],
                benefits: ['Priority live-lead assignment', 'Immediate commission eligibility', '$100 bonus on next paycheck'],
              },
              {
                level: 'B', title: 'Certified Representative', color: 'blue',
                req: ['Written exam: 80–89% + passed mock call', 'OR 90%+ but not first attempt mock call'],
                benefits: ['Active status', 'Eligible for live leads & commission'],
              },
              {
                level: 'C', title: 'Conditional / Retesting', color: 'orange',
                req: ['Failed exam or mock call — awaiting retry'],
                benefits: ['Not active', 'No live leads or commission', 'Unpaid retraining until passing'],
              },
              {
                level: 'D', title: 'Terminated', color: 'red',
                req: ['Failed exam twice', 'Failed mock call 3×', 'Missed / refused certification'],
                benefits: ['Immediate termination'],
              },
            ].map(({ level, title, color, req, benefits }) => {
              const badge: Record<string, string> = {
                amber: 'bg-warning text-warning',
                blue: 'bg-primary text-primary-foreground',
                orange: 'bg-warning text-primary-foreground',
                red: 'bg-destructive text-primary-foreground',
              }
              const border: Record<string, string> = {
                amber: 'border-warning/30',
                blue: 'border-primary/30',
                orange: 'border-warning/30',
                red: 'border-destructive/30',
              }
              return (
                <div key={level} className={`border ${border[color]} rounded-xl overflow-hidden`}>
                  <div className="px-4 py-2.5 flex items-center gap-2.5 border-b" style={{ borderColor: 'inherit' }}>
                    <span className={`${badge[color]} w-7 h-7 text-sm font-black rounded-lg flex items-center justify-center shrink-0`}>{level}</span>
                    <span className="text-sm font-bold text-foreground">{title}</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Requirements</p>
                      <ul className="space-y-1">{req.map(r => <li key={r} className="text-xs text-foreground/90 flex gap-1.5"><span className="mt-1 w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0"/>{r}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Result / Benefits</p>
                      <ul className="space-y-1">{benefits.map(b => <li key={b} className="text-xs text-foreground/90 flex gap-1.5"><span className="mt-1 w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0"/>{b}</li>)}</ul>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ),
      },
    ],
  },
  {
    id: 'commission',
    date: 'Jun 11, 2026',
    tag: 'Policy Update',
    tagColor: 'blue' as const,
    icon: '📋',
    title: 'Commission Structure Update',
    summary: '$30 per closed case. Replacement cases are not eligible for commission.',
    sections: [
      {
        heading: 'What Changed',
        content: (
          <div className="space-y-3 text-sm text-foreground/90 leading-relaxed">
            <p>We have updated our commission structure. Effective immediately:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Commission: <strong>$30 per closed case</strong></li>
              <li>Replacement cases: <strong>not eligible</strong> for commission.</li>
            </ul>
            <p>A replacement means the PC was not fully closed and qualified according to our criteria — it also means the PC was not properly vetted regarding communication and treatment, which affects case quality.</p>
            <p>Our goal is to incentivize the team to focus on closing fully qualified, high-quality cases. This increase in commission rate aligns payment with quality performance.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'friday-sync',
    date: 'Every Friday',
    tag: 'Recurring',
    tagColor: 'gray' as const,
    icon: '📅',
    title: 'Weekly Friday Sync',
    summary: 'Every Friday at 3:00 PM PST via Google Meet.',
    sections: [
      {
        heading: 'Meeting Details',
        content: (
          <div className="space-y-3">
            <a
              href="https://meet.google.com/cwv-xecz-anc"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-success/10 border border-success/30 rounded-xl px-4 py-3 hover:bg-success/10 transition-colors"
            >
              <svg className="w-5 h-5 text-success shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 18H4a2 2 0 01-2-2V8a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2zM4 8v8h16V8H4zm10 1l5 3-5 3V9z" />
              </svg>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Google Meet · Every Friday 3:00 PM PST</p>
                <p className="text-sm font-semibold text-success">meet.google.com/cwv-xecz-anc</p>
              </div>
            </a>
            <div className="space-y-3">
              {[
                { title: 'Conference Session', items: ['Lagging Points from Rep side', 'Lagging Points from Management side'] },
                { title: 'Call Review Session', items: ['Reasoning on why we lost this PC', 'Discussion on how to improve / close better'] },
                { title: 'Evaluation Session', items: ['Scoreboard Analysis'] },
              ].map(s => (
                <div key={s.title}>
                  <p className="text-sm font-bold text-foreground mb-1">{s.title}</p>
                  <ul className="space-y-1">{s.items.map(i => <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-border shrink-0"/>{i}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
]

const tagColors: Record<string, string> = {
  red:  'bg-destructive/10 text-destructive',
  blue: 'bg-accent text-primary',
  gray: 'bg-muted text-muted-foreground',
}

export default function NotificationsPage() {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>('certification')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/teams/login'); return }
      const { data: prof } = await supabase.from('profiles').select('team_type').eq('id', user.id).single()
      if (prof?.team_type === 'creative') { router.push('/teams/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  if (checking) return null

  return (
      <TeamsShell timeclockEnabled={false} teamType="intake">
      <PageHeader
        title="Notifications"
        description="Announcements, policy updates and recurring reminders."
      />
      <PageBody>


        <div className="space-y-3">
          {notifications.map(n => (
            <div key={n.id} className="bg-card border border-border rounded-2xl overflow-hidden ">
              {/* Card header — always visible */}
              <button
                className="w-full text-left px-5 py-4 flex items-start gap-4"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}
              >
                <span className="text-2xl shrink-0 mt-0.5">{n.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tagColors[n.tagColor]}`}>{n.tag}</span>
                    <span className="text-xs text-muted-foreground">{n.date}</span>
                  </div>
                  <p className="font-bold text-foreground text-sm leading-snug">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.summary}</p>
                </div>
                <svg
                  className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${expanded === n.id ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded content */}
              {expanded === n.id && (
                <div className="px-5 pb-6 space-y-5 border-t border-border pt-4">
                  {n.sections.map(s => (
                    <div key={s.heading}>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">{s.heading}</p>
                      {s.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        </PageBody>
      </TeamsShell>
  )
}
