'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#EDEAE3'
const CARD   = '#FFFFFF'
const DARK   = '#1A1A1A'
const BORDER = '#D4CEBF'
const MUTED  = '#7A7468'
const ACCENT = '#C17A4A'

const DATE_PRESETS = [
  { label: 'All Time',    value: 'maximum'  },
  { label: 'Last 30d',   value: 'last_30d' },
  { label: 'Last 14d',   value: 'last_14d' },
  { label: 'Last 7 days',value: 'last_7d'  },
]

// ─── Types ────────────────────────────────────────────────────────────────────
type PipelineLead = { name: string | null; phone: string | null; email: string | null; createdAt: string | null }

type AngleStat = {
  code:           string
  name:           string
  spend:          number
  leads:          number
  signedCases:    number
  nrCount:        number
  nqCount:        number
  fuCount:        number
  chaseCount:     number
  nrLeads:        PipelineLead[]
  nqLeads:        PipelineLead[]
  fuLeads:        PipelineLead[]
  chaseLeads:     PipelineLead[]
  adCount:        number
  cpl:            number | null
  cpq:            number | null
  conversionRate: number | null
}

type ComboStat = AngleStat & { visualCode: string; verbalCode: string }

type PipelineModalState = { stat: AngleStat; stage: 'nr' | 'nq' | 'fu' | 'chase' } | null

type AnglesData = {
  datePreset:    string
  visual:        AngleStat[]
  verbal:        AngleStat[]
  combos:        ComboStat[]
  unparsedAds:   number
  unparsedSpend: number
  aiAnalysis:    string | null
  analyzedAt:    string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (n: number | null) =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US')

const fmtPct = (n: number | null) =>
  n == null ? '—' : n.toFixed(1) + '%'

function cpqColor(cpq: number | null) {
  if (cpq == null) return MUTED
  if (cpq <= 600)  return '#15803D'
  if (cpq <= 900)  return '#CA8A04'
  return '#DC2626'
}

function cplColor(cpl: number | null) {
  if (cpl == null) return MUTED
  if (cpl <= 120)  return '#15803D'
  if (cpl <= 200)  return '#CA8A04'
  return '#DC2626'
}

// ─── Shared table header ──────────────────────────────────────────────────────
function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      textAlign: right ? 'right' : 'left',
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.07em', color: MUTED,
      padding: '9px 12px', whiteSpace: 'nowrap',
      borderBottom: `1px solid ${BORDER}`,
      background: '#F5F1EB',
    }}>
      {children}
    </th>
  )
}

// ─── Angle rank badge ─────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  const bg = rank === 1 ? '#FEF9C3' : rank === 2 ? '#F3F4F6' : rank === 3 ? '#FEF3E2' : 'transparent'
  const color = rank === 1 ? '#713F12' : rank <= 3 ? '#374151' : MUTED
  return (
    <span style={{ display: 'inline-block', width: 24, textAlign: 'center', fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 4, padding: '1px 4px' }}>
      {rank}
    </span>
  )
}

// ─── Angle stats table ────────────────────────────────────────────────────────
function StageBtn({ count, color, onClick }: { count: number; color: string; onClick: () => void }) {
  if (count === 0) return <span style={{ color: MUTED, fontSize: 12 }}>—</span>
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color, fontSize: 12, fontWeight: 600, textDecoration: 'underline', textDecorationColor: `${color}55` }}>
      {count}
    </button>
  )
}

function AngleTable({ stats, showVisual, showVerbal, onStageClick }: { stats: AngleStat[]; showVisual?: boolean; showVerbal?: boolean; onStageClick: (stat: AngleStat, stage: 'nr' | 'nq' | 'fu' | 'chase') => void }) {
  if (stats.length === 0) {
    return <p style={{ fontSize: 13, color: MUTED, padding: '24px 0' }}>No data yet for this period.</p>
  }
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${BORDER}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <TH>#</TH>
            <TH>Code</TH>
            <TH>Hook Name</TH>
            <TH right>Spend</TH>
            <TH right>Leads</TH>
            <TH right>CPL</TH>
            <TH right>Signed</TH>
            <TH right>CPQ</TH>
            <TH right>Conv%</TH>
            <TH right>NR</TH>
            <TH right>NQ</TH>
            <TH right>F/U</TH>
            <TH right>Chase</TH>
            <TH right>Ads</TH>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={s.code} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? CARD : '#FAFAF8' }}>
              <td style={{ padding: '10px 12px', width: 32 }}><RankBadge rank={i + 1} /></td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12, color: DARK,
                  background: showVisual ? '#FEF3C7' : showVerbal ? '#EDE9FE' : '#F3F4F6',
                  borderRadius: 4, padding: '2px 6px' }}>
                  {s.code}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: DARK, fontWeight: 500, maxWidth: 240 }}>{s.name}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: MUTED }}>{fmt$(s.spend)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: DARK, fontWeight: s.leads > 0 ? 600 : 400 }}>{s.leads || '—'}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: cplColor(s.cpl) }}>{fmt$(s.cpl)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: s.signedCases > 0 ? '#15803D' : MUTED, fontWeight: s.signedCases > 0 ? 700 : 400 }}>{s.signedCases || '—'}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: cpqColor(s.cpq) }}>{fmt$(s.cpq)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: MUTED, fontSize: 12 }}>{fmtPct(s.conversionRate)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}><StageBtn count={s.nrCount} color='#2563EB' onClick={() => onStageClick(s, 'nr')} /></td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}><StageBtn count={s.nqCount} color='#DC2626' onClick={() => onStageClick(s, 'nq')} /></td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}><StageBtn count={s.fuCount} color='#CA8A04' onClick={() => onStageClick(s, 'fu')} /></td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}><StageBtn count={s.chaseCount} color='#EA580C' onClick={() => onStageClick(s, 'chase')} /></td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: MUTED, fontSize: 11 }}>{s.adCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Combination table ────────────────────────────────────────────────────────
function ComboTable({ stats, onStageClick }: { stats: ComboStat[]; onStageClick: (stat: AngleStat, stage: 'nr' | 'nq' | 'fu' | 'chase') => void }) {
  if (stats.length === 0) {
    return <p style={{ fontSize: 13, color: MUTED, padding: '24px 0' }}>No combination data yet.</p>
  }
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${BORDER}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <TH>#</TH>
            <TH>Visual</TH>
            <TH>Verbal</TH>
            <TH right>Spend</TH>
            <TH right>Leads</TH>
            <TH right>CPL</TH>
            <TH right>Signed</TH>
            <TH right>CPQ</TH>
            <TH right>Conv%</TH>
            <TH right>NR</TH>
            <TH right>NQ</TH>
            <TH right>F/U</TH>
            <TH right>Chase</TH>
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={s.code} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? CARD : '#FAFAF8' }}>
              <td style={{ padding: '10px 12px', width: 32 }}><RankBadge rank={i + 1} /></td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 4, padding: '1px 5px', display: 'inline-block' }}>{s.visualCode}</span>
                  <span style={{ fontSize: 11, color: MUTED, maxWidth: 140, lineHeight: 1.3 }}>
                    {VISUAL_HOOK_NAMES[s.visualCode] || s.visualCode}
                  </span>
                </div>
              </td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#5B21B6', background: '#EDE9FE', borderRadius: 4, padding: '1px 5px', display: 'inline-block' }}>{s.verbalCode}</span>
                  <span style={{ fontSize: 11, color: MUTED, maxWidth: 160, lineHeight: 1.3 }}>
                    {VERBAL_HOOK_NAMES[s.verbalCode] || s.verbalCode}
                  </span>
                </div>
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: MUTED }}>{fmt$(s.spend)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: DARK, fontWeight: s.leads > 0 ? 600 : 400 }}>{s.leads || '—'}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: cplColor(s.cpl) }}>{fmt$(s.cpl)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: s.signedCases > 0 ? '#15803D' : MUTED, fontWeight: s.signedCases > 0 ? 700 : 400 }}>{s.signedCases || '—'}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: cpqColor(s.cpq) }}>{fmt$(s.cpq)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: MUTED, fontSize: 12 }}>{fmtPct(s.conversionRate)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}><StageBtn count={s.nrCount} color='#2563EB' onClick={() => onStageClick(s, 'nr')} /></td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}><StageBtn count={s.nqCount} color='#DC2626' onClick={() => onStageClick(s, 'nq')} /></td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}><StageBtn count={s.fuCount} color='#CA8A04' onClick={() => onStageClick(s, 'fu')} /></td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}><StageBtn count={s.chaseCount} color='#EA580C' onClick={() => onStageClick(s, 'chase')} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Client-side lookup (mirrors server)
const VISUAL_HOOK_NAMES: Record<string, string> = {
  A1: 'Skeleton', A2: 'Animated Surgery', A3: 'Accident', A4: 'Check', A5: 'New Car',
  A6: 'Split View (Half Screen)', A7: 'State Map', A8: 'Check & Talking Head (Bold Guy)',
  A9: 'Check & Talking Head (Working Woman)', A10: 'Animal',
}

const VERBAL_HOOK_NAMES: Record<string, string> = {
  B1: 'Insurance Company', B2: "They don't want you to know", B3: 'Never Sue',
  B4: 'New Claim Tool', B5: 'How I got new car', B6: 'Music Only',
  B7: 'Looking for 10 accident victims', B8: 'Understand your options (Educational)',
  B9: 'You may be owed a bigger check', B10: 'Injuries take days to appear',
  B11: 'Miss out on money', B12: 'Do I have to sue to get paid', B13: 'Passenger Angle',
  B14: '3 Mistakes', B15: 'Eligible for a bigger payout', B16: 'Do Not Call Attorney',
  B17: 'Been in car accident and did not go to the hospital',
  B18: 'Life after getting $100k (Banner)', B19: "Didn't Go To ER",
}

// ─── Pipeline leads modal ─────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = { nr: 'No Response', nq: 'Not Qualified', fu: 'Follow Up', chase: 'Chase' }
const STAGE_COLORS: Record<string, string> = { nr: '#2563EB', nq: '#DC2626', fu: '#CA8A04', chase: '#EA580C' }

function PipelineLeadsModal({ modal, onClose }: { modal: PipelineModalState; onClose: () => void }) {
  if (!modal) return null
  const leads = modal.stat[`${modal.stage}Leads` as 'nrLeads' | 'nqLeads' | 'fuLeads' | 'chaseLeads'] || []
  const color = STAGE_COLORS[modal.stage]
  const label = STAGE_LABELS[modal.stage]
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <div style={{ background: '#FFF', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: DARK }}>
              {modal.stat.code} — {modal.stat.name}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{leads.length} lead{leads.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: MUTED, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {leads.length === 0 ? (
            <p style={{ padding: '32px 24px', textAlign: 'center', color: MUTED, fontSize: 14 }}>No leads in this stage.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F5F1EB' }}>
                  <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, borderBottom: `1px solid ${BORDER}` }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, borderBottom: `1px solid ${BORDER}` }}>Phone</th>
                  <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, borderBottom: `1px solid ${BORDER}` }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, borderBottom: `1px solid ${BORDER}` }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? '#FFF' : '#FAFAF8' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500 }}>{lead.name || '—'}</td>
                    <td style={{ padding: '10px 16px', color: MUTED }}>{lead.phone || '—'}</td>
                    <td style={{ padding: '10px 16px', color: MUTED, fontSize: 12 }}>{lead.email || '—'}</td>
                    <td style={{ padding: '10px 16px', color: MUTED, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AI Analysis renderer ─────────────────────────────────────────────────────
function AIAnalysis({ text }: { text: string }) {
  // Simple markdown-like renderer: bold headers, paragraphs
  const sections = text.split(/\n(?=\d+\.\s|\*\*\d|\n)/).filter(Boolean)
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: DARK }}>
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} style={{ height: 10 }} />
        // Bold section headers like **VISUAL HOOK WINNERS**
        if (/^\*\*.*\*\*$/.test(trimmed)) {
          const title = trimmed.replace(/\*\*/g, '')
          return (
            <h3 key={i} style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: ACCENT, marginTop: 20, marginBottom: 6 }}>
              {title}
            </h3>
          )
        }
        // Numbered sections like "1. **VISUAL..."
        if (/^\d+\.\s\*\*/.test(trimmed)) {
          const title = trimmed.replace(/^\d+\.\s\*\*/, '').replace(/\*\*.*/, '')
          const rest  = trimmed.replace(/^\d+\.\s\*\*[^*]+\*\*\s*—?\s*/, '')
          return (
            <div key={i} style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: ACCENT, marginBottom: 6 }}>
                {trimmed.match(/^\d+/)?.[0]}. {title}
              </h3>
              {rest && <p style={{ margin: 0, color: DARK }}>{rest}</p>}
            </div>
          )
        }
        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 8 }}>
              <span style={{ color: ACCENT, flexShrink: 0, marginTop: 2 }}>•</span>
              <span>{trimmed.replace(/^[-•]\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1')}</span>
            </div>
          )
        }
        // Regular text — strip markdown bold
        return (
          <p key={i} style={{ margin: '0 0 6px', color: DARK }}>
            {trimmed.replace(/\*\*([^*]+)\*\*/g, '$1')}
          </p>
        )
      })}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AnglesPage() {
  const router = useRouter()
  const [datePreset,    setDatePreset]    = useState('maximum')
  const [data,          setData]          = useState<AnglesData | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [analyzing,     setAnalyzing]     = useState(false)
  const [section,       setSection]       = useState<'visual' | 'verbal' | 'combos'>('visual')
  const [pipelineModal, setPipelineModal] = useState<PipelineModalState>(null)

  const load = useCallback((preset: string) => {
    setLoading(true)
    fetch(`/api/metrics/angles?date_preset=${preset}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load(datePreset) }, [datePreset, load])

  async function runAnalysis() {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/metrics/angles?date_preset=${datePreset}&analyze=true`)
      const d   = await res.json()
      setData(d)
    } finally {
      setAnalyzing(false)
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login')
  }

  const totalSpend  = data ? [...data.visual].reduce((s, a) => s + a.spend, 0) : 0
  // Use max spend across angles to estimate account total (visual and verbal overlap so don't sum)
  const topVisual   = data?.visual[0]  || null
  const topVerbal   = data?.verbal[0]  || null
  const topCombo    = data?.combos[0]  || null

  return (
    <div style={{ minHeight: '100vh', background: BG, color: DARK }}>
      <PipelineLeadsModal modal={pipelineModal} onClose={() => setPipelineModal(null)} />

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '0 24px', display: 'flex', alignItems: 'stretch', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingRight: 28, marginRight: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: DARK }}>CaseBridge</span>
            <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, fontSize: 16, color: ACCENT, marginLeft: 5 }}>Metrics</span>
          </div>
          {[
            { label: 'Overview',   href: '/metrics?tab=overview'   },
            { label: 'Marketing',  href: '/metrics?tab=marketing'  },
            { label: 'HR',         href: '/metrics?tab=hr'         },
            { label: 'Firms',      href: '/metrics?tab=firms'      },
            { label: 'Angles',     href: '/metrics/angles'         },
          ].map(({ label, href }) => (
            <Link key={label} href={href}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '14px 16px', fontSize: 13,
                fontWeight: label === 'Angles' ? 700 : 500,
                color: label === 'Angles' ? DARK : MUTED,
                borderBottom: label === 'Angles' ? `2px solid ${DARK}` : '2px solid transparent',
                textDecoration: 'none', transition: 'all 0.15s',
              }}>
              {label}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select value={datePreset} onChange={e => setDatePreset(e.target.value)}
            style={{ background: DARK, color: '#FFF', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
            {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: MUTED }}>Logout</button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 28px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, margin: 0, color: DARK }}>
              Creative{' '}
              <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, color: ACCENT }}>Angles</span>
            </h1>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>
              Which visual &amp; verbal hooks are driving the best results — by CPQ, CPL, and conversion rate.
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing || loading}
            style={{
              background: analyzing ? '#4B5563' : DARK,
              color: '#FFF', border: 'none', borderRadius: 8,
              padding: '10px 20px', fontSize: 13, fontWeight: 600,
              cursor: analyzing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.2s',
            }}>
            {analyzing ? (
              <>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Analyzing…
              </>
            ) : (
              <>✦ Run AI Analysis</>
            )}
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: MUTED, fontSize: 14 }}>Loading angle data…</div>
        ) : !data ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: MUTED }}>Failed to load data.</div>
        ) : (
          <>
            {/* ── Quick-glance winner cards ─────────────────────────────── */}
            {(topVisual || topVerbal || topCombo) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32, marginTop: 16 }}>
                {topVisual && (
                  <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 10, padding: '16px 20px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#92400E', marginBottom: 6 }}>Top Visual Hook</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: '#713F12', marginBottom: 2 }}>
                      {topVisual.code} — {topVisual.name}
                    </p>
                    <p style={{ fontSize: 12, color: '#92400E' }}>
                      CPQ {fmt$(topVisual.cpq)} · CPL {fmt$(topVisual.cpl)} · {topVisual.signedCases} signed
                    </p>
                  </div>
                )}
                {topVerbal && (
                  <div style={{ background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 10, padding: '16px 20px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#5B21B6', marginBottom: 6 }}>Top Verbal Hook</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: '#4C1D95', marginBottom: 2 }}>
                      {topVerbal.code} — {topVerbal.name}
                    </p>
                    <p style={{ fontSize: 12, color: '#5B21B6' }}>
                      CPQ {fmt$(topVerbal.cpq)} · CPL {fmt$(topVerbal.cpl)} · {topVerbal.signedCases} signed
                    </p>
                  </div>
                )}
                {topCombo && (
                  <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 10, padding: '16px 20px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#14532D', marginBottom: 6 }}>Top Combination</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: '#14532D', marginBottom: 2 }}>
                      {topCombo.visualCode} + {topCombo.verbalCode}
                    </p>
                    <p style={{ fontSize: 12, color: '#166534' }}>
                      CPQ {fmt$(topCombo.cpq)} · CPL {fmt$(topCombo.cpl)} · {topCombo.signedCases} signed
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Section tabs ────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
              {([
                { key: 'visual', label: `Visual Hooks (A)`, count: data.visual.length },
                { key: 'verbal', label: `Verbal Hooks (B)`, count: data.verbal.length },
                { key: 'combos', label: `Combinations`,     count: data.combos.length },
              ] as const).map(({ key, label, count }) => (
                <button key={key} onClick={() => setSection(key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '10px 18px', fontSize: 13,
                    fontWeight: section === key ? 700 : 500,
                    color: section === key ? DARK : MUTED,
                    borderBottom: section === key ? `2px solid ${DARK}` : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                  {label}
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: MUTED }}>({count})</span>
                </button>
              ))}
            </div>

            {/* ── Tables ──────────────────────────────────────────────────── */}
            {section === 'visual' && (
              <div>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
                  Visual hooks (A codes) are ranked by CPQ then spend. Green CPQ = under $600, yellow = under $900, red = over $900.
                </p>
                <AngleTable stats={data.visual} showVisual onStageClick={(stat, stage) => setPipelineModal({ stat, stage })} />
              </div>
            )}
            {section === 'verbal' && (
              <div>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
                  Verbal hooks (B codes) represent the spoken message or text overlay. Ranked by CPQ then spend.
                </p>
                <AngleTable stats={data.verbal} showVerbal onStageClick={(stat, stage) => setPipelineModal({ stat, stage })} />
              </div>
            )}
            {section === 'combos' && (
              <div>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>
                  Combinations showing both visual and verbal hook performance together. Ranked by CPQ then spend.
                </p>
                <ComboTable stats={data.combos} onStageClick={(stat, stage) => setPipelineModal({ stat, stage })} />
              </div>
            )}

            {/* ── Unparsed note ────────────────────────────────────────────── */}
            {data.unparsedAds > 0 && (
              <p style={{ fontSize: 11, color: MUTED, marginTop: 16 }}>
                {data.unparsedAds} ad{data.unparsedAds > 1 ? 's' : ''} (~{fmt$(data.unparsedSpend)} spend) could not be matched to an angle code and are excluded above. These ads likely have naming formats that don't follow the A_ | B_ convention.
              </p>
            )}

            {/* ── AI Analysis ──────────────────────────────────────────────── */}
            {data.aiAnalysis && (
              <div style={{ marginTop: 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: 0 }}>
                    AI{' '}
                    <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, color: ACCENT }}>Analysis</span>
                  </h2>
                  {data.analyzedAt && (
                    <span style={{ fontSize: 11, color: MUTED }}>
                      Generated {new Date(data.analyzedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '24px 28px' }}>
                  <AIAnalysis text={data.aiAnalysis} />
                </div>
              </div>
            )}

            {/* Spin animation */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  )
}
