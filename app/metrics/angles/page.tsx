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
  { label: 'All Time',     value: 'maximum'  },
  { label: 'Last 30d',    value: 'last_30d' },
  { label: 'Last 14d',    value: 'last_14d' },
  { label: 'Last 7 days', value: 'last_7d'  },
]

// ─── Angle type config ────────────────────────────────────────────────────────
const ANGLE_TYPES = [
  { id: 'BR-AD',    label: 'BR-AD',    subtitle: 'Branded',   codes: 'A-B', vPfx: 'A', bPfx: 'B', color: '#F97316', lightBg: '#FFF7ED' },
  { id: 'HYB-AD',   label: 'HYB-AD',   subtitle: 'Hybrid',    codes: 'C-D', vPfx: 'C', bPfx: 'D', color: '#8B5CF6', lightBg: '#F5F3FF' },
  { id: 'AIUGC-AD', label: 'AIUGC-AD', subtitle: 'AI UGC',    codes: 'E-F', vPfx: 'E', bPfx: 'F', color: '#EAB308', lightBg: '#FEFCE8' },
  { id: 'BNR-AD',   label: 'BNR-AD',   subtitle: 'Banner',    codes: 'G-H', vPfx: 'G', bPfx: 'H', color: '#22C55E', lightBg: '#F0FDF4' },
  { id: 'ANM-AD',   label: 'ANM-AD',   subtitle: 'Animated',  codes: 'I-J', vPfx: 'I', bPfx: 'J', color: '#EC4899', lightBg: '#FDF2F8' },
  { id: 'IMG-AD',   label: 'IMG-AD',   subtitle: 'Image',     codes: 'K-L', vPfx: 'K', bPfx: 'L', color: '#3B82F6', lightBg: '#EFF6FF' },
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
  firm:          string
  visual:        AngleStat[]
  verbal:        AngleStat[]
  combos:        ComboStat[]
  unparsedAds:   number
  unparsedSpend: number
  aiAnalysis:    string | null
  analyzedAt:    string | null
}

const FIRMS = [
  { id: 'all', label: 'All Firms' },
  { id: 'FL',  label: 'Fears Law' },
  { id: 'JLL', label: 'Levine Law' },
]

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

// ─── Hook name lookups ────────────────────────────────────────────────────────
const VISUAL_HOOK_NAMES: Record<string, string> = {
  A1: 'Skeleton', A2: 'Animated Surgery', A3: 'Accident', A4: 'Check', A5: 'New Car',
  A6: 'Split View (Half Screen)', A7: 'State Map', A8: 'Check & Talking Head (Bold Guy)',
  A9: 'Check & Talking Head (Working Woman)', A10: 'Animal', A11: 'Attention Hook',
  A12: 'Animated Bone', A13: 'Simulation Crash',
  C1: 'Black 30ish Lady Talking Head', C2: 'Bold Old Guy', C3: 'White Man',
  E1: 'In the Car', E2: 'Gas Station', E3: 'Gym', E4: 'Black AI Avatar', E5: 'Latino AI Avatar',
  G1: 'Accident', G2: 'Car Driving',
}

const VERBAL_HOOK_NAMES: Record<string, string> = {
  B1: 'Insurance Company', B2: "They don't want you to know", B3: 'Never Sue',
  B4: 'New Claim Tool', B5: 'How I got new car', B6: 'Music Only',
  B7: 'Looking for 10 accident victims', B8: 'Understand your options (Educational)',
  B9: 'You may be owed a bigger check', B10: 'Injuries take days to appear',
  B11: 'Miss out on money', B12: 'Do I have to sue to get paid', B13: 'Passenger Angle',
  B14: '3 Mistakes', B15: 'Eligible for a bigger payout', B16: 'Do Not Call Attorney',
  B17: 'Been in car accident and did not go to the hospital',
  B18: "Didn't Go To ER", B19: "Insurance Company doesn't care you go to ER",
  B20: 'This is Viral Hack', B21: "Don't Accept first check from insurance",
  B22: 'Think you are fine after car accident no ER no AMB', B23: 'Never do this 3 things',
  B24: 'Never call insurance yourself', B25: 'Just Now feeling the pain',
  B26: 'Old lady crushed and said I ran green light', B27: 'Car looks like this Body feels like this',
  D1: 'Settlement Comparison', D2: 'You will regret suing the person who hit you',
  D3: 'If you skipped ER after your car accident',
  F1: 'I need to tell you something (Whisper)', F2: 'How much did you get for the little accident',
  F3: 'First day back at gym after my accident', F4: 'Settlement Amount Comparison',
  H1: "Didn't go to the ER", H2: 'Never Sue the person who hit you',
  H3: 'I almost let insurance settle my accident for',
  H4: "I didn't know there were two checks you could get",
  H5: 'Drink Driver hit my car (BNR)', H6: 'Biggest Mistake',
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

function RankBadge({ rank }: { rank: number }) {
  const bg    = rank === 1 ? '#FEF9C3' : rank === 2 ? '#F3F4F6' : rank === 3 ? '#FEF3E2' : 'transparent'
  const color = rank === 1 ? '#713F12' : rank <= 3 ? '#374151' : MUTED
  return (
    <span style={{ display: 'inline-block', width: 24, textAlign: 'center', fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 4, padding: '1px 4px' }}>
      {rank}
    </span>
  )
}

function StageBtn({ count, color, onClick }: { count: number; color: string; onClick: () => void }) {
  if (count === 0) return <span style={{ color: MUTED, fontSize: 12 }}>—</span>
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color, fontSize: 12, fontWeight: 600, textDecoration: 'underline', textDecorationColor: `${color}55` }}>
      {count}
    </button>
  )
}

// ─── Hook table (visual or verbal) ───────────────────────────────────────────
function HookTable({ stats, isVisual, accentColor, onStageClick }: {
  stats: AngleStat[]
  isVisual: boolean
  accentColor: string
  onStageClick: (stat: AngleStat, stage: 'nr' | 'nq' | 'fu' | 'chase') => void
}) {
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
                  background: isVisual ? '#FEF3C7' : '#EDE9FE',
                  borderRadius: 4, padding: '2px 8px' }}>
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
    return <p style={{ fontSize: 13, color: MUTED, padding: '24px 0' }}>No combination data yet for this period.</p>
  }
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${BORDER}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <TH>#</TH>
            <TH>Visual Hook</TH>
            <TH>Verbal Hook</TH>
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
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 4, padding: '1px 6px', display: 'inline-block' }}>{s.visualCode}</span>
                  <span style={{ fontSize: 11, color: MUTED, maxWidth: 160, lineHeight: 1.3 }}>
                    {VISUAL_HOOK_NAMES[s.visualCode] || s.visualCode}
                  </span>
                </div>
              </td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#5B21B6', background: '#EDE9FE', borderRadius: 4, padding: '1px 6px', display: 'inline-block' }}>{s.verbalCode}</span>
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
            <div style={{ fontSize: 16, fontWeight: 700, color: DARK }}>{modal.stat.code} — {modal.stat.name}</div>
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
                  {['Name', 'Phone', 'Email', 'Date'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
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
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: DARK }}>
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} style={{ height: 10 }} />
        if (/^\*\*.*\*\*$/.test(trimmed)) {
          return <h3 key={i} style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: ACCENT, marginTop: 20, marginBottom: 6 }}>{trimmed.replace(/\*\*/g, '')}</h3>
        }
        if (/^\d+\.\s\*\*/.test(trimmed)) {
          const title = trimmed.replace(/^\d+\.\s\*\*/, '').replace(/\*\*.*/, '')
          const rest  = trimmed.replace(/^\d+\.\s\*\*[^*]+\*\*\s*—?\s*/, '')
          return (
            <div key={i} style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: ACCENT, marginBottom: 6 }}>
                {trimmed.match(/^\d+/)?.[0]}. {title}
              </h3>
              {rest && <p style={{ margin: 0 }}>{rest}</p>}
            </div>
          )
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 8 }}>
              <span style={{ color: ACCENT, flexShrink: 0, marginTop: 2 }}>•</span>
              <span>{trimmed.replace(/^[-•]\s*/, '').replace(/\*\*([^*]+)\*\*/g, '$1')}</span>
            </div>
          )
        }
        return <p key={i} style={{ margin: '0 0 6px' }}>{trimmed.replace(/\*\*([^*]+)\*\*/g, '$1')}</p>
      })}
    </div>
  )
}

// ─── Angle summary card ───────────────────────────────────────────────────────
function AngleCard({
  config,
  visual,
  verbal,
  onClick,
}: {
  config: typeof ANGLE_TYPES[0]
  visual: AngleStat[]
  verbal: AngleStat[]
  onClick: () => void
}) {
  const totalSpend    = visual.reduce((s, a) => s + a.spend, 0)
  const totalLeads    = visual.reduce((s, a) => s + a.leads, 0)
  const totalSigned   = visual.reduce((s, a) => s + a.signedCases, 0)
  const bestCpq       = visual.filter(a => a.cpq != null).sort((a, b) => (a.cpq ?? 9999) - (b.cpq ?? 9999))[0]?.cpq ?? null
  const hasData       = totalSpend > 0 || visual.length > 0

  return (
    <button
      onClick={onClick}
      style={{
        background: CARD,
        border: `1.5px solid ${BORDER}`,
        borderRadius: 14,
        padding: '20px 22px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.15s',
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = config.color; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px ${config.color}22` }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
    >
      {/* Color dot */}
      <div style={{ width: 40, height: 40, borderRadius: 10, background: config.lightBg, border: `1.5px solid ${config.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: config.color }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: DARK }}>{config.label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: config.color, background: config.lightBg, borderRadius: 5, padding: '2px 7px' }}>
            {config.codes}
          </span>
        </div>
        <p style={{ fontSize: 12, color: MUTED, margin: '0 0 12px' }}>{config.subtitle} · {visual.length} visual + {verbal.length} verbal</p>

        {hasData ? (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {totalSpend > 0 && (
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, margin: '0 0 2px' }}>Spend</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: DARK, margin: 0 }}>{fmt$(totalSpend)}</p>
              </div>
            )}
            {totalLeads > 0 && (
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, margin: '0 0 2px' }}>Leads</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: DARK, margin: 0 }}>{totalLeads}</p>
              </div>
            )}
            {totalSigned > 0 && (
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, margin: '0 0 2px' }}>Signed</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#15803D', margin: 0 }}>{totalSigned}</p>
              </div>
            )}
            {bestCpq != null && (
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, margin: '0 0 2px' }}>Best CPQ</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: cpqColor(bestCpq), margin: 0 }}>{fmt$(bestCpq)}</p>
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: MUTED, fontStyle: 'italic', margin: 0 }}>No data yet for this period</p>
        )}
      </div>

      <div style={{ color: MUTED, fontSize: 18, lineHeight: 1, alignSelf: 'center' }}>›</div>
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AnglesPage() {
  const router = useRouter()

  const [datePreset,     setDatePreset]     = useState('maximum')
  const [firm,           setFirm]           = useState('all')
  const [data,           setData]           = useState<AnglesData | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [analyzing,      setAnalyzing]      = useState(false)
  const [selectedAngle,  setSelectedAngle]  = useState<string | null>(null)
  const [section,        setSection]        = useState<'visual' | 'verbal' | 'combos'>('visual')
  const [pipelineModal,  setPipelineModal]  = useState<PipelineModalState>(null)

  const load = useCallback((preset: string, firmId: string) => {
    setLoading(true)
    fetch(`/api/metrics/angles?date_preset=${preset}&firm=${firmId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load(datePreset, firm) }, [datePreset, firm, load])

  async function runAnalysis() {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/metrics/angles?date_preset=${datePreset}&firm=${firm}&analyze=true`)
      setData(await res.json())
    } finally {
      setAnalyzing(false)
    }
  }

  // Filter data for selected angle type
  const angleConfig = ANGLE_TYPES.find(a => a.id === selectedAngle)
  const filteredVisual = data && angleConfig ? data.visual.filter(s => s.code.startsWith(angleConfig.vPfx)) : []
  const filteredVerbal = data && angleConfig ? data.verbal.filter(s => s.code.startsWith(angleConfig.bPfx)) : []
  const filteredCombos = data && angleConfig ? data.combos.filter(s => s.visualCode.startsWith(angleConfig.vPfx)) : []

  const navItems = [
    { label: 'Marketing', href: '/metrics?tab=marketing' },
    { label: 'HR',        href: '/metrics?tab=hr'        },
    { label: 'Firms',     href: '/metrics?tab=firms'     },
    { label: 'Angles',    href: '/metrics/angles'        },
    { label: 'OOS Cases', href: '/metrics/oos-cases'     },
  ]

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
          {navItems.map(({ label, href }) => (
            <Link key={label} href={href}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '14px 16px', fontSize: 13,
                fontWeight: label === 'Angles' ? 700 : 500,
                color: label === 'Angles' ? DARK : MUTED,
                borderBottom: label === 'Angles' ? `2px solid ${DARK}` : '2px solid transparent',
                textDecoration: 'none',
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
          <button onClick={() => { fetch('/api/auth/logout', { method: 'POST' }); router.push('/login') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: MUTED }}>
            Logout
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 28px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── LANDING: angle type grid ───────────────────────────────────────── */}
        {!selectedAngle && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, margin: '0 0 8px', color: DARK }}>
                Creative{' '}
                <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, color: ACCENT }}>Angles</span>
              </h1>
              <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px' }}>
                All creatives are built from a Visual Hook + Verbal Hook combination. Select an angle type to explore performance.
              </p>
              {/* Firm filter */}
              <div style={{ display: 'flex', gap: 6 }}>
                {FIRMS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFirm(f.id)}
                    style={{
                      padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 20,
                      border: `1.5px solid ${firm === f.id ? DARK : BORDER}`,
                      background: firm === f.id ? DARK : CARD,
                      color: firm === f.id ? '#FFF' : MUTED,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: MUTED, fontSize: 14 }}>Loading angle data…</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {ANGLE_TYPES.map(config => {
                  const vis = data ? data.visual.filter(s => s.code.startsWith(config.vPfx)) : []
                  const vbl = data ? data.verbal.filter(s => s.code.startsWith(config.bPfx)) : []
                  return (
                    <AngleCard
                      key={config.id}
                      config={config}
                      visual={vis}
                      verbal={vbl}
                      onClick={() => { setSelectedAngle(config.id); setSection('visual') }}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── DETAIL: selected angle ─────────────────────────────────────────── */}
        {selectedAngle && angleConfig && (
          <>
            {/* Back + header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <button
                  onClick={() => setSelectedAngle(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: MUTED, padding: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  ← All Angles
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: angleConfig.lightBg, border: `1.5px solid ${angleConfig.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: angleConfig.color }} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: DARK }}>{angleConfig.label}</h1>
                      {firm !== 'all' && (
                        <span style={{ fontSize: 11, fontWeight: 700, background: DARK, color: '#FFF', borderRadius: 6, padding: '2px 8px' }}>
                          {FIRMS.find(f => f.id === firm)?.label}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: MUTED, margin: '2px 0 0' }}>
                      {angleConfig.subtitle} · Visual hooks ({angleConfig.vPfx}) + Verbal hooks ({angleConfig.bPfx})
                    </p>
                  </div>
                </div>
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
                }}>
                {analyzing ? (
                  <>
                    <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Analyzing…
                  </>
                ) : '✦ Run AI Analysis'}
              </button>
            </div>

            {/* Quick stats */}
            {!loading && (filteredVisual.length > 0 || filteredVerbal.length > 0) && (() => {
              const totalSpend  = filteredVisual.reduce((s, a) => s + a.spend, 0)
              const totalLeads  = filteredVisual.reduce((s, a) => s + a.leads, 0)
              const totalSigned = filteredVisual.reduce((s, a) => s + a.signedCases, 0)
              const overallCpq  = totalSigned > 0 ? totalSpend / totalSigned : null
              const overallCpl  = totalLeads  > 0 ? totalSpend / totalLeads  : null
              return totalSpend > 0 ? (
                <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Total Spend',  value: fmt$(totalSpend),  color: DARK    },
                    { label: 'Leads',        value: String(totalLeads), color: DARK    },
                    { label: 'Signed Cases', value: String(totalSigned), color: '#15803D' },
                    { label: 'Overall CPL',  value: fmt$(overallCpl),  color: cplColor(overallCpl) },
                    { label: 'Overall CPQ',  value: fmt$(overallCpq),  color: cpqColor(overallCpq) },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 18px', minWidth: 100 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, margin: '0 0 4px' }}>{label}</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color, margin: 0 }}>{value || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : null
            })()}

            {/* Section tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
              {([
                { key: 'visual', label: `Visual Hooks (${angleConfig.vPfx})`, count: filteredVisual.length },
                { key: 'verbal', label: `Verbal Hooks (${angleConfig.bPfx})`, count: filteredVerbal.length },
                { key: 'combos', label: 'Combinations',                        count: filteredCombos.length },
              ] as const).map(({ key, label, count }) => (
                <button key={key} onClick={() => setSection(key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '10px 18px', fontSize: 13,
                    fontWeight: section === key ? 700 : 500,
                    color: section === key ? DARK : MUTED,
                    borderBottom: section === key ? `2px solid ${angleConfig.color}` : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                  {label}
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: MUTED }}>({count})</span>
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: MUTED, fontSize: 14 }}>Loading…</div>
            ) : (
              <>
                {section === 'visual' && (
                  <HookTable
                    stats={filteredVisual}
                    isVisual
                    accentColor={angleConfig.color}
                    onStageClick={(stat, stage) => setPipelineModal({ stat, stage })}
                  />
                )}
                {section === 'verbal' && (
                  <HookTable
                    stats={filteredVerbal}
                    isVisual={false}
                    accentColor={angleConfig.color}
                    onStageClick={(stat, stage) => setPipelineModal({ stat, stage })}
                  />
                )}
                {section === 'combos' && (
                  <ComboTable
                    stats={filteredCombos}
                    onStageClick={(stat, stage) => setPipelineModal({ stat, stage })}
                  />
                )}

                {/* AI Analysis */}
                {data?.aiAnalysis && (
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
              </>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
