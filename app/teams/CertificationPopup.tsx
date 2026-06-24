'use client'
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'cb_cert_popup_v1_dismissed'

export default function CertificationPopup() {
  const [show, setShow] = useState(false)
  const [tab, setTab] = useState<'schedule' | 'levels'>('schedule')

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') return
    setShow(true)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="bg-[#0f1e3c] rounded-t-2xl px-7 pt-6 pb-5 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-1">Required for Live Leads</p>
              <h2 className="text-white text-xl font-bold leading-tight">Case Bridge Operator Certification</h2>
              <p className="text-blue-200 text-sm mt-2 leading-snug max-w-md">
                Every caller must pass the <span className="text-white font-semibold">Case Bridge Nuance Certification</span> and <span className="text-white font-semibold">Jason's Final Mock Call</span> before being assigned live leads.
              </p>
            </div>
            <button onClick={dismiss} className="text-blue-400 hover:text-white mt-0.5 shrink-0 transition-colors" aria-label="Close">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-5">
            {(['schedule', 'levels'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                  tab === t ? 'bg-white text-[#0f1e3c]' : 'text-blue-300 hover:text-white'
                }`}
              >
                {t === 'schedule' ? '📆 Schedule' : '🏆 Cert Levels'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto flex-1 px-7 py-6 space-y-5">

          {tab === 'schedule' && (
            <>
              {/* Day 1 */}
              <DayCard
                day="Day 1"
                title="Nuance Certification Study Day"
                badge="PAID"
                badgeColor="green"
                items={[
                  'Read the full Nuances Book.',
                  'Prepare for Day 2 group exam.',
                  'Submit study confirmation before end of shift.',
                  'Recommended: submit 10 key notes learned + 3 questions / confusing scenarios.',
                ]}
              />

              {/* Day 2 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <span className="bg-[#0f1e3c] text-white text-xs font-bold px-2.5 py-1 rounded-lg">Day 2</span>
                    <span className="font-bold text-gray-900 text-sm">Nuance Certification Group Exam</span>
                  </div>
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">PAID*</span>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-sm text-gray-600">Live group exam via <span className="font-semibold text-gray-800">Google Meet</span>. Screen share is <span className="font-semibold text-red-600">required</span>.</p>

                  {/* Pass path */}
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-2">
                    <p className="text-sm font-bold text-green-800 flex items-center gap-2">
                      <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded font-bold">PASS</span> Written Exam
                    </p>
                    <div className="pl-3 border-l-2 border-green-300 space-y-1.5">
                      <p className="text-xs text-gray-700">→ Move immediately to <span className="font-semibold">Jason's Final Mock Call</span></p>
                      <div className="bg-white border border-green-200 rounded-md px-3 py-2 space-y-1">
                        <p className="text-xs font-bold text-green-700 flex items-center gap-1.5">
                          <span className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">PASS</span> Mock Call → Active Representative ✓
                        </p>
                        <p className="text-xs font-bold text-red-700 flex items-center gap-1.5 mt-1">
                          <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">FAIL</span> Mock Call → Clock out immediately → Unpaid retraining
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Fail path */}
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <p className="text-sm font-bold text-red-800 flex items-center gap-2">
                      <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded font-bold">FAIL</span> Written Exam
                    </p>
                    <p className="text-xs text-gray-700 mt-1.5 pl-3 border-l-2 border-red-300">Clock out immediately → Unpaid study status → Re-exam on Day 3</p>
                  </div>

                  {/* Mock call attempts */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Mock Call Attempt Rules</p>
                    <div className="space-y-1.5">
                      {[
                        { attempt: 'Attempt 1', when: 'Day 2 — after passing written exam' },
                        { attempt: 'Attempt 2', when: 'After unpaid restudy / retraining' },
                        { attempt: 'Attempt 3', when: 'Final chance — additional unpaid retraining' },
                      ].map(({ attempt, when }) => (
                        <div key={attempt} className="flex items-start gap-2 text-xs text-gray-700">
                          <span className="bg-[#0f1e3c] text-white font-bold px-2 py-0.5 rounded shrink-0">{attempt}</span>
                          <span>{when}</span>
                        </div>
                      ))}
                      <p className="text-xs text-red-700 font-semibold mt-2 pt-2 border-t border-gray-200">Fail the 3rd mock call → Immediate termination</p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 italic">* Paid until exam/mock result is determined.</p>
                </div>
              </div>

              {/* Day 3 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <span className="bg-[#0f1e3c] text-white text-xs font-bold px-2.5 py-1 rounded-lg">Day 3</span>
                    <span className="font-bold text-gray-900 text-sm">Group Re-Exam Day</span>
                  </div>
                  <span className="text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">UNPAID</span>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-sm text-gray-600">Only for reps who <span className="font-semibold text-red-700">failed Day 2's written exam</span>. You must go back to the Nuances Book, study, then take the re-exam.</p>
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                    <p className="text-xs font-bold text-green-800 flex items-center gap-1.5">
                      <span className="bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">PASS</span> Re-exam → Move to Jason's Final Mock Call (same rules apply)
                    </p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                    <p className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                      <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">FAIL</span> Re-exam → <span className="text-red-700">Immediate termination</span>
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'levels' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Your certification level is determined by your written exam score and mock call performance.</p>

              <LevelCard
                level="A"
                title="Fast Track Certified Representative"
                color="amber"
                requirements={[
                  'Written exam score: 90%+',
                  "Passed Jason's Final Mock Call on the first attempt",
                ]}
                benefits={[
                  'Active Case Bridge Representative status',
                  'Priority live-lead assignment',
                  'Immediate commission eligibility',
                  'Recognition as Fast Track Certified',
                  '$100 bonus on next paycheck',
                ]}
              />

              <LevelCard
                level="B"
                title="Certified Representative"
                color="blue"
                requirements={[
                  'Written exam score: 80–89% + passed mock call',
                  'OR written exam score: 90%+ + passed mock call (not first attempt)',
                ]}
                benefits={[
                  'Active Case Bridge Representative status',
                  'Eligible for live leads',
                  'Eligible for commission',
                ]}
              />

              <LevelCard
                level="C"
                title="Conditional / Retesting Status"
                color="orange"
                requirements={[
                  'Failed written exam on Day 2',
                  "Passed written exam but failed Jason's mock call",
                  'Waiting for re-exam or mock call retry',
                ]}
                benefits={[
                  'Not active — no live leads',
                  'No commission eligibility',
                  'Unpaid study/retraining status until you pass',
                ]}
                benefitsLabel="Status"
              />

              <LevelCard
                level="D"
                title="Failed Certification / Termination"
                color="red"
                requirements={[
                  'Failed the written exam twice',
                  "Failed Jason's Final Mock Call three times",
                  'Missed exam / refused to participate / did not follow certification rules',
                ]}
                benefits={['Immediate termination']}
                benefitsLabel="Result"
              />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-7 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          {tab === 'schedule' ? (
            <button
              onClick={() => setTab('levels')}
              className="flex-1 bg-[#0f1e3c] hover:bg-[#1a3060] text-white font-bold text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Next: Cert Levels
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <>
              <button
                onClick={() => setTab('schedule')}
                className="px-5 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-sm rounded-xl transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <button
                onClick={dismiss}
                className="flex-1 bg-[#0f1e3c] hover:bg-[#1a3060] text-white font-bold text-sm py-3 rounded-xl transition-colors"
              >
                I understand — close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function DayCard({ day, title, badge, badgeColor, items }: {
  day: string; title: string; badge: string; badgeColor: 'green' | 'red';
  items: string[]
}) {
  const badgeCls = badgeColor === 'green'
    ? 'text-green-700 bg-green-100'
    : 'text-red-700 bg-red-100'
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="bg-[#0f1e3c] text-white text-xs font-bold px-2.5 py-1 rounded-lg">{day}</span>
          <span className="font-bold text-gray-900 text-sm">{title}</span>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeCls}`}>{badge}</span>
      </div>
      <ul className="px-5 py-4 space-y-2">
        {items.map(item => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#0f1e3c] shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

type LevelColor = 'amber' | 'blue' | 'orange' | 'red'

const levelStyles: Record<LevelColor, { badge: string; header: string; border: string }> = {
  amber: { badge: 'bg-amber-400 text-amber-900', header: 'bg-amber-50 border-amber-200', border: 'border-amber-200' },
  blue:  { badge: 'bg-blue-600 text-white',       header: 'bg-blue-50 border-blue-200',   border: 'border-blue-200' },
  orange:{ badge: 'bg-orange-400 text-white',     header: 'bg-orange-50 border-orange-200', border: 'border-orange-200' },
  red:   { badge: 'bg-red-600 text-white',        header: 'bg-red-50 border-red-200',     border: 'border-red-200' },
}

function LevelCard({ level, title, color, requirements, benefits, benefitsLabel = 'Benefits' }: {
  level: string; title: string; color: LevelColor;
  requirements: string[]; benefits: string[]; benefitsLabel?: string
}) {
  const s = levelStyles[color]
  return (
    <div className={`border ${s.border} rounded-xl overflow-hidden`}>
      <div className={`${s.header} border-b ${s.border} px-5 py-3 flex items-center gap-3`}>
        <span className={`${s.badge} text-sm font-black w-8 h-8 rounded-lg flex items-center justify-center shrink-0`}>
          {level}
        </span>
        <span className="font-bold text-gray-900 text-sm">{title}</span>
      </div>
      <div className="px-5 py-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Requirements</p>
          <ul className="space-y-1.5">
            {requirements.map(r => (
              <li key={r} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{benefitsLabel}</p>
          <ul className="space-y-1.5">
            {benefits.map(b => (
              <li key={b} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
