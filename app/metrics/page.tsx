'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ─── Design tokens ──────────────────────────────────────────────────────────
const BG     = '#EDEAE3'
const CARD   = '#FFFFFF'
const DARK   = '#1A1A1A'
const BORDER = '#D4CEBF'
const MUTED  = '#7A7468'
const ACCENT = '#C17A4A'

const DATE_PRESETS = [
  { label: 'Today',       value: 'today' },
  { label: 'Yesterday',   value: 'yesterday' },
  { label: 'Last 7 days', value: 'last_7d' },
  { label: 'Last 14 days',value: 'last_14d' },
  { label: 'Last 30 days',value: 'last_30d' },
]

// ─── Stat cards ─────────────────────────────────────────────────────────────
function LightCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: DARK, lineHeight: 1 }}>{value ?? '—'}</p>
      {sub && <p style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{sub}</p>}
    </div>
  )
}
function DarkCard({ label, value, sub, terracotta }: { label: string; value: string | number; sub?: string; terracotta?: boolean }) {
  return (
    <div style={{ background: DARK, border: `1px solid #333`, borderRadius: 10, padding: '18px 20px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9CA3AF', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: terracotta ? ACCENT : '#FFFFFF', lineHeight: 1 }}>{value ?? '—'}</p>
      {sub && <p style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

// ─── Phase / alert helpers ───────────────────────────────────────────────────
function alertLevel(ad: any): 'kill' | 'watch' | 'floor' | 'read_decide' | 'scale' | null {
  const spend = ad.spend ?? 0, leads = ad.metaLeads ?? ad.leads ?? 0
  const cpl = ad.cpl ?? null, cpq = ad.cpq != null ? parseFloat(ad.cpq) : null, signed = ad.signedCases ?? 0
  if (spend < 600) { if (cpl != null && cpl > 300) return 'kill'; return 'floor' }
  if (leads === 0) return 'kill'
  if (leads >= 8 && signed >= 2 && (cpl == null || cpl <= 300) && (cpq == null || cpq <= 1200)) return 'scale'
  if (cpl != null && cpl > 300 && cpq != null && cpq > 1200 && signed === 0) return 'kill'
  if (cpl != null && cpl > 300) return 'watch'
  if (leads >= 5 && cpl != null && cpl > 220) return 'read_decide'
  if (cpq != null && cpq > 1200) return 'watch'
  if (cpl != null && cpl > 220) return 'watch'
  return null
}

function AlertPill({ level }: { level: ReturnType<typeof alertLevel> }) {
  if (!level) return null
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    kill:        { bg: '#FEE2E2', color: '#991B1B', label: 'KILL'         },
    watch:       { bg: '#FEF9C3', color: '#78350F', label: 'WATCH'        },
    floor:       { bg: '#F3F4F6', color: '#4B5563', label: 'FLOOR'        },
    read_decide: { bg: '#FFF7ED', color: '#9A3412', label: 'READ/DECIDE'  },
    scale:       { bg: '#DCFCE7', color: '#14532D', label: 'SCALE ↑'      },
  }
  const c = cfg[level]
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

function campaignPhase(ads: any[]): { label: string; bg: string; color: string } {
  const levels = ads.map(alertLevel)
  if (levels.includes('scale'))       return { label: 'SCALE',  bg: '#DCFCE7', color: '#14532D' }
  if (levels.includes('read_decide')) return { label: 'REVIEW', bg: '#FFF7ED', color: '#9A3412' }
  if (levels.includes('watch'))       return { label: 'WATCH',  bg: '#FEF9C3', color: '#78350F' }
  if (levels.includes('kill'))        return { label: 'KILL',   bg: '#FEE2E2', color: '#991B1B' }
  if (levels.includes('floor'))       return { label: 'FLOOR',  bg: '#F3F4F6', color: '#4B5563' }
  return                                    { label: 'ACTIVE', bg: '#E0F2FE', color: '#075985' }
}

function fmt$(n: number | null | undefined) {
  if (n == null) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─── Campaign section ────────────────────────────────────────────────────────
function CampaignSection({ name, ads, onClickStage, onClickLeads }: {
  name: string; ads: any[]
  onClickStage: (ad: any, stage: 'nr' | 'nq' | 'fu' | 'chase') => void
  onClickLeads: (ad: any) => void
}) {
  const totalSpend  = ads.reduce((s, a) => s + (a.spend ?? 0), 0)
  const totalLeads  = ads.reduce((s, a) => s + (a.metaLeads ?? a.leads ?? 0), 0)
  const totalSigned = ads.reduce((s, a) => s + (a.signedCases ?? 0), 0)
  const totalNr     = ads.reduce((s, a) => s + (a.nrCount ?? 0), 0)
  const totalNq     = ads.reduce((s, a) => s + (a.nqCount ?? 0), 0)
  const totalFu     = ads.reduce((s, a) => s + (a.fuCount ?? 0), 0)
  const totalChase  = ads.reduce((s, a) => s + (a.chaseCount ?? 0), 0)
  const cpl  = totalLeads  > 0 ? totalSpend / totalLeads  : null
  const cpq  = totalSigned > 0 ? totalSpend / totalSigned : null
  const phase = campaignPhase(ads)

  const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th style={{ textAlign: right ? 'right' : 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, padding: '9px 10px', whiteSpace: 'nowrap', borderBottom: `1px solid ${BORDER}`, background: '#F5F1EB' }}>
      {children}
    </th>
  )

  const dim = '#C4BAB0'
  const fmtPct = (v: number | null | undefined) => v != null ? v.toFixed(2) + '%' : '—'

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
      {/* Campaign header — dark */}
      <div style={{ background: DARK, padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: phase.bg, color: phase.color, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {phase.label}
          </span>
          <span style={{ color: '#E5E7EB', fontWeight: 600, fontSize: 13 }}>{name}</span>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>
          <span><span style={{ color: '#FFF', fontWeight: 700 }}>{fmt$(totalSpend)}</span> spend</span>
          <span><span style={{ color: '#FFF', fontWeight: 700 }}>{totalLeads}</span> leads</span>
          <span>CPL <span style={{ color: ACCENT, fontWeight: 700 }}>{fmt$(cpl)}</span></span>
          <span>CPQ <span style={{ color: ACCENT, fontWeight: 700 }}>{fmt$(cpq)}</span></span>
          {totalSigned > 0 && <span>SIGNED <span style={{ color: '#4ADE80', fontWeight: 700 }}>{totalSigned}</span></span>}
        </div>
      </div>

      {/* Ads table — same columns as firm marketing page */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <TH> </TH>
              <TH>Creative</TH>
              <TH>Ad Set</TH>
              <TH>Spend</TH>
              <TH>Leads</TH>
              <TH>CPL</TH>
              <TH>CPC</TH>
              <TH>CTR</TH>
              <TH>Click→Lead</TH>
              <TH>LPV→Lead</TH>
              <TH>NR</TH>
              <TH>NQ</TH>
              <TH>F/U</TH>
              <TH>Chase</TH>
              <TH>Signed</TH>
              <TH>CPQ</TH>
              <TH>Phase</TH>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad, i) => {
              const level  = alertLevel(ad)
              const cplVal = ad.cpl != null ? parseFloat(String(ad.cpl)) : null
              const cpqVal = ad.cpq != null ? parseFloat(String(ad.cpq)) : null
              const leads  = ad.metaLeads ?? ad.leads ?? 0
              const c2l    = ad.clickToLeadPct != null ? parseFloat(String(ad.clickToLeadPct)) : null
              const lpv    = ad.lpvToLeadPct   != null ? parseFloat(String(ad.lpvToLeadPct))   : null
              const rowBg  = level === 'kill' ? 'rgba(254,226,226,0.35)' : level === 'scale' ? 'rgba(220,252,231,0.25)' : i % 2 === 1 ? '#FAFAF8' : '#FFFFFF'
              return (
                <tr key={ad.id || i} style={{ borderBottom: `1px solid ${BORDER}`, background: rowBg }}>
                  {/* Active dot */}
                  <td style={{ padding: '8px 10px', width: 14 }}>
                    <span style={{ display: 'block', width: 7, height: 7, borderRadius: '50%', background: ad.isActive ? '#22C55E' : '#D1D5DB' }} />
                  </td>

                  {/* Creative */}
                  <td style={{ padding: '8px 10px', maxWidth: 200 }}>
                    {ad.firmSlug && ad.latestInvoice ? (
                      <Link href={`/metrics/firms/${ad.firmSlug}/invoice/${ad.latestInvoice}/marketing`} style={{ color: ACCENT, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.name || ad.adName}>
                        {ad.name || ad.adName || '—'}
                      </Link>
                    ) : (
                      <span style={{ color: DARK, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.name || ad.adName}>
                        {ad.name || ad.adName || '—'}
                      </span>
                    )}
                    {ad.firmName && <span style={{ fontSize: 10, color: MUTED, display: 'block' }}>{ad.firmName}</span>}
                    {ad.id && <span style={{ fontSize: 9, color: '#B5AFA8', display: 'block', fontFamily: 'monospace' }}>{ad.id}</span>}
                  </td>

                  {/* Ad Set */}
                  <td style={{ padding: '8px 10px', maxWidth: 160, color: MUTED }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ad.adsetName}>
                      {ad.adsetName || '—'}
                    </span>
                  </td>

                  {/* Spend */}
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: DARK, whiteSpace: 'nowrap' }}>{fmt$(ad.spend)}</td>

                  {/* Leads */}
                  <td style={{ padding: '8px 10px' }}>
                    {leads > 0
                      ? <button onClick={() => onClickLeads(ad)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: DARK, fontWeight: 600, textDecoration: 'underline', textDecorationColor: '#C4BAB0', textUnderlineOffset: 2, fontSize: 12 }}>{leads}</button>
                      : <span style={{ color: dim }}>—</span>}
                  </td>

                  {/* CPL */}
                  <td style={{ padding: '8px 10px', fontWeight: cplVal != null && cplVal > 300 ? 700 : 400, color: cplVal == null ? dim : cplVal > 300 ? '#B91C1C' : cplVal > 220 ? '#92400E' : DARK }}>
                    {cplVal != null ? fmt$(cplVal) : '—'}
                  </td>

                  {/* CPC */}
                  <td style={{ padding: '8px 10px', color: ad.cpc != null ? MUTED : dim }}>
                    {ad.cpc != null ? fmt$(ad.cpc) : '—'}
                  </td>

                  {/* CTR */}
                  <td style={{ padding: '8px 10px', color: MUTED }}>{ad.ctr ? ad.ctr.toFixed(2) + '%' : '—'}</td>

                  {/* Click→Lead */}
                  <td style={{ padding: '8px 10px', color: c2l == null ? dim : c2l < 0.5 ? '#B91C1C' : MUTED, fontWeight: c2l != null && c2l < 0.5 ? 700 : 400 }}>
                    {fmtPct(c2l)}
                  </td>

                  {/* LPV→Lead */}
                  <td style={{ padding: '8px 10px', color: lpv == null ? dim : MUTED }}>
                    {fmtPct(lpv)}
                  </td>

                  {/* NR */}
                  <td style={{ padding: '8px 10px' }}>
                    {(ad.nrCount ?? 0) > 0
                      ? <button onClick={() => onClickStage(ad, 'nr')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: DARK, fontWeight: 600, textDecoration: 'underline', textDecorationColor: '#C4BAB0', textUnderlineOffset: 2, fontSize: 12 }}>{ad.nrCount}</button>
                      : <span style={{ color: dim }}>—</span>}
                  </td>

                  {/* NQ */}
                  <td style={{ padding: '8px 10px' }}>
                    {(ad.nqCount ?? 0) > 0
                      ? <button onClick={() => onClickStage(ad, 'nq')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#B91C1C', fontWeight: 700, textDecoration: 'underline', textDecorationColor: '#FCA5A5', textUnderlineOffset: 2, fontSize: 12 }}>{ad.nqCount}</button>
                      : <span style={{ color: dim }}>—</span>}
                  </td>

                  {/* F/U */}
                  <td style={{ padding: '8px 10px' }}>
                    {(ad.fuCount ?? 0) > 0
                      ? <button onClick={() => onClickStage(ad, 'fu')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: ACCENT, fontWeight: 600, textDecoration: 'underline', textDecorationColor: '#E8C4A0', textUnderlineOffset: 2, fontSize: 12 }}>{ad.fuCount}</button>
                      : <span style={{ color: dim }}>—</span>}
                  </td>

                  {/* Chase */}
                  <td style={{ padding: '8px 10px' }}>
                    {(ad.chaseCount ?? 0) > 0
                      ? <button onClick={() => onClickStage(ad, 'chase')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#EA580C', fontWeight: 600, textDecoration: 'underline', textDecorationColor: '#FDBA74', textUnderlineOffset: 2, fontSize: 12 }}>{ad.chaseCount}</button>
                      : <span style={{ color: dim }}>—</span>}
                  </td>

                  {/* Signed */}
                  <td style={{ padding: '8px 10px', fontWeight: (ad.signedCases ?? 0) > 0 ? 700 : 400, color: (ad.signedCases ?? 0) > 0 ? '#15803D' : dim }}>
                    {(ad.signedCases ?? 0) > 0 ? ad.signedCases : '—'}
                  </td>

                  {/* CPQ */}
                  <td style={{ padding: '8px 10px', fontWeight: cpqVal != null ? 700 : 400, color: cpqVal == null ? dim : cpqVal <= 1200 ? '#15803D' : cpqVal > 2000 ? '#B91C1C' : '#92400E' }}>
                    {cpqVal != null ? fmt$(cpqVal) : '—'}
                  </td>

                  {/* Phase */}
                  <td style={{ padding: '8px 10px' }}><AlertPill level={level} /></td>
                </tr>
              )
            })}
          </tbody>
          {/* Totals row */}
          <tfoot>
            <tr style={{ background: '#2A2520' }}>
              <td colSpan={2}></td>
              <td style={{ padding: '9px 10px', color: '#9CA3AF', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>Totals</td>
              <td style={{ padding: '9px 10px', color: '#FFF', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt$(totalSpend)}</td>
              <td style={{ padding: '9px 10px', color: '#FFF', fontWeight: 600 }}>{totalLeads || '—'}</td>
              <td style={{ padding: '9px 10px', color: ACCENT, fontWeight: 700 }}>{fmt$(cpl)}</td>
              <td colSpan={4}></td>
              <td style={{ padding: '9px 10px', color: '#9CA3AF' }}>{totalNr || '—'}</td>
              <td style={{ padding: '9px 10px', color: totalNq > 0 ? '#FCA5A5' : '#9CA3AF' }}>{totalNq || '—'}</td>
              <td style={{ padding: '9px 10px', color: totalFu > 0 ? ACCENT : '#9CA3AF' }}>{totalFu || '—'}</td>
              <td style={{ padding: '9px 10px', color: totalSigned > 0 ? '#4ADE80' : '#9CA3AF', fontWeight: 700 }}>{totalSigned || '—'}</td>
              <td style={{ padding: '9px 10px', color: ACCENT, fontWeight: 700 }}>{fmt$(cpq)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Creative leads modal — lazy-loads from /api/metrics/creative-leads ──────
const STAGE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  fu:     { label: 'Follow Up',     bg: '#FEF3C7', color: '#92400E' },
  nr:     { label: 'No Response',   bg: '#F3F4F6', color: '#374151' },
  nq:     { label: 'Not Qualified', bg: '#FEE2E2', color: '#991B1B' },
  chase:  { label: 'Chase',         bg: '#FFF7ED', color: '#C2410C' },
  signed: { label: 'Signed',        bg: '#DCFCE7', color: '#166534' },
}

function CreativeLeadsModal({ ad, filterStage, onClose }: {
  ad: any; filterStage?: 'nr' | 'nq' | 'fu' | 'chase' | null; onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Data is pre-loaded from the same GHL pipeline fetch as the firm page
  const all: any[] = [
    ...(ad.nrLeads    || []).map((l: any) => ({ ...l, stage: 'nr' })),
    ...(ad.nqLeads    || []).map((l: any) => ({ ...l, stage: 'nq' })),
    ...(ad.fuLeads    || []).map((l: any) => ({ ...l, stage: 'fu' })),
    ...(ad.chaseLeads || []).map((l: any) => ({ ...l, stage: 'chase' })),
  ]
  const displayed = filterStage ? all.filter(l => l.stage === filterStage) : all
  const metaLeads = ad.metaLeads ?? ad.leads ?? 0

  const stageTitle = filterStage
    ? (STAGE_BADGE[filterStage]?.label || filterStage.toUpperCase())
    : 'GHL Pipeline Leads'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: filterStage ? (STAGE_BADGE[filterStage]?.color || MUTED) : MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stageTitle}</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: DARK, lineHeight: 1.3 }}>{ad.name || ad.adName || '—'}</p>
            {ad.id && <p style={{ fontSize: 10, color: MUTED, fontFamily: 'monospace', marginTop: 3 }}>{ad.id}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 20, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {displayed.length === 0 ? (
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 14, padding: '40px 24px' }}>
              {all.length === 0
                ? 'No GHL pipeline leads matched to this creative.'
                : `No ${stageTitle} leads for this creative.`}
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}`, background: '#F5F1EB' }}>
                  {['Contact', 'Phone', 'Status', 'Date'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, padding: '10px 16px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((lead: any, i: number) => {
                  const sb = STAGE_BADGE[lead.stage] || STAGE_BADGE.nr
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '10px 16px', color: DARK, fontWeight: 500 }}>{lead.name || '—'}</td>
                      <td style={{ padding: '10px 16px', color: MUTED, fontSize: 12 }}>{lead.phone || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: sb.bg, color: sb.color }}>{sb.label}</span>
                      </td>
                      <td style={{ padding: '10px 16px', color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ padding: '10px 24px', borderTop: `1px solid ${BORDER}`, fontSize: 11, color: MUTED, display: 'flex', gap: 16 }}>
          <span>{all.length} in GHL pipeline</span>
          <span>{metaLeads} Meta leads</span>
        </div>
      </div>
    </div>
  )
}

// ─── HR / Firms helpers ──────────────────────────────────────────────────────
const BLANK_FIRM = { name: '', slug: '', case_value: '', meta_account_id: 'act_788484706914452', phase_initial: '5600', phase_scale: '11200', replacement_window_days: '14', sanguine_rate: '250' }

// ─── Main page ───────────────────────────────────────────────────────────────
export default function MetricsPage() {
  const router = useRouter()
  const [datePreset, setDatePreset] = useState('today')
  const [metaData, setMetaData] = useState<any>(null)
  const [attribution, setAttribution] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'marketing' | 'hr' | 'firms'>('marketing')
  const [creativeOverview, setCreativeOverview] = useState<Record<string, any>>({})
  const [pipelineOverview, setPipelineOverview] = useState<Record<string, any>>({})
  const [workers, setWorkers] = useState<any[]>([])
  const [timeEntries, setTimeEntries] = useState<any[]>([]) // today's time entries
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null)
  const [leadsModal, setLeadsModal] = useState<{ ad: any; stage?: 'nr' | 'nq' | 'fu' | 'chase' } | null>(null)
  const [firms, setFirms] = useState<any[]>([])
  const [showAddWorker, setShowAddWorker] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [createdWorker, setCreatedWorker] = useState<{ name: string; password: string } | null>(null)
  const [showAddFirm, setShowAddFirm] = useState(false)
  const [firmForm, setFirmForm] = useState(BLANK_FIRM)
  const [firmSaving, setFirmSaving] = useState(false)
  const [firmError, setFirmError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); let cancelled = false
    const p1 = fetch(`/api/metrics?date_preset=${datePreset}`).then(r => r.json()).catch(() => ({})).then(d => { if (!cancelled) setMetaData(d) })
    const p2 = fetch('/api/metrics/attribution').then(r => r.json()).catch(() => ({})).then(d => { if (!cancelled) setAttribution(d) })
    Promise.allSettled([p1, p2]).then(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [datePreset])

  useEffect(() => {
    let c = false
    fetch('/api/metrics/firms').then(r => r.json()).then(d => { if (!c) setFirms(d.firms || []) }).catch(() => {})
    return () => { c = true }
  }, [])

  useEffect(() => {
    fetch('/api/metrics/workers').then(r => r.json()).then(d => setWorkers(d.workers || [])).catch(() => {})
    const today = new Date().toISOString().slice(0, 10)
    fetch(`/api/metrics/time-entries?date=${today}`).then(r => r.json()).then(d => setTimeEntries(d.workers || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/metrics/creative-overview?date_preset=${datePreset}`)
      .then(r => r.json())
      .then(d => {
        const data = d.byAdId || {}
        setCreativeOverview(data)
        setPipelineOverview(data)
      })
      .catch(() => {})
  }, [datePreset])

  async function handleAddWorker(e: React.FormEvent) {
    e.preventDefault()
    if (!addName.trim() || !addPassword.trim()) { setAddError('Name and password required.'); return }
    setAddLoading(true); setAddError('')
    const res = await fetch('/api/teams/admin/reps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: addName.trim(), password: addPassword }) })
    const data = await res.json(); setAddLoading(false)
    if (!res.ok) { setAddError(data.error || 'Failed.'); return }
    setCreatedWorker({ name: addName.trim(), password: addPassword }); setAddName(''); setAddPassword('')
    setWorkers(prev => [...prev, { id: data.id, name: addName.trim() }])
  }

  async function addFirm(e: React.FormEvent) {
    e.preventDefault(); setFirmSaving(true); setFirmError(null)
    const res = await fetch('/api/metrics/firms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: firmForm.name, slug: firmForm.slug, case_value: firmForm.case_value, meta_account_id: firmForm.meta_account_id, phase_initial_max_weekly_spend: firmForm.phase_initial, phase_scale_max_weekly_spend: firmForm.phase_scale, replacement_window_days: firmForm.replacement_window_days, sanguine_rate_per_closed_case: firmForm.sanguine_rate }) })
    const data = await res.json(); setFirmSaving(false)
    if (data.error) { setFirmError(data.error); return }
    setFirms(prev => [...prev, data.firm]); setShowAddFirm(false); setFirmForm(BLANK_FIRM)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login')
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const spend = parseFloat(metaData?.summary?.spend || 0)
  const totalLeads = metaData?.summary?.leads ?? 0
  const totalImpressions = metaData?.summary?.impressions ?? 0
  const totalClicks = metaData?.summary?.clicks ?? 0

  // Build ad-level attribution first so CPQ uses the same signed-case source
  const adsWithAttribution = (metaData?.ads || []).map((ad: any) => {
    const ov = creativeOverview[ad.id] || {}
    const pl = pipelineOverview[ad.id] || {}
    const signedCases = ov.signedCases || 0
    const adCpq = signedCases > 0 ? ad.spend / signedCases : null
    return { ...ad, signedCases, cpq: adCpq, isActive: ad.spend > 0, firmSlug: ov.firmSlug || null, firmName: ov.firmName || null, latestInvoice: ov.latestInvoice || null, nrCount: pl.nrCount || 0, nqCount: pl.nqCount || 0, fuCount: pl.fuCount || 0, chaseCount: pl.chaseCount || 0, nrLeads: pl.nrLeads || [], nqLeads: pl.nqLeads || [], fuLeads: pl.fuLeads || [], chaseLeads: pl.chaseLeads || [] }
  }).sort((a: any, b: any) => b.spend - a.spend)

  // CPQ = total spend / total signed cases (both from the same date-filtered Meta + attribution data)
  const totalSignedCases = adsWithAttribution.reduce((s: number, ad: any) => s + (ad.signedCases || 0), 0)
  const cpl = totalLeads > 0 ? (spend / totalLeads) : null
  const cpq = totalSignedCases > 0 ? (spend / totalSignedCases) : null

  // Group ads by campaign for Ops Dashboard view
  const campaignGroups: Record<string, { name: string; ads: any[] }> = {}
  for (const ad of adsWithAttribution) {
    const key = ad.campaignId || ad.campaignName || '—'
    if (!campaignGroups[key]) campaignGroups[key] = { name: ad.campaignName || 'Unknown Campaign', ads: [] }
    campaignGroups[key].ads.push(ad)
  }
  const sortedGroups = Object.values(campaignGroups).sort((a, b) =>
    b.ads.reduce((s: number, ad: any) => s + ad.spend, 0) - a.ads.reduce((s: number, ad: any) => s + ad.spend, 0)
  )

  // ── Input style ──────────────────────────────────────────────────────────
  const inputStyle = { background: '#F5F0E8', border: `1px solid ${BORDER}`, color: DARK, borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none' }

  // ── Shared section label ──────────────────────────────────────────────────
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED, marginBottom: 12 }}>{children}</p>
  )

  return (
    <div style={{ minHeight: '100vh', background: BG, color: DARK }}>

      {/* ── Top nav bar ─────────────────────────────────────────────────── */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '0 24px', display: 'flex', alignItems: 'stretch', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingRight: 28, marginRight: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: DARK }}>CaseBridge</span>
            <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, fontSize: 16, color: ACCENT, marginLeft: 5 }}>Metrics</span>
          </div>
          {(['marketing', 'hr', 'firms'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, color: activeTab === tab ? DARK : MUTED, borderBottom: activeTab === tab ? `2px solid ${DARK}` : '2px solid transparent', transition: 'all 0.15s' }}>
              {tab === 'hr' ? 'HR' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          <Link href="/metrics/angles"
            style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', fontSize: 13, fontWeight: 500, color: MUTED, borderBottom: '2px solid transparent', textDecoration: 'none', transition: 'all 0.15s' }}>
            Angles
          </Link>
          <Link href="/metrics/oos-cases"
            style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', fontSize: 13, fontWeight: 500, color: MUTED, borderBottom: '2px solid transparent', textDecoration: 'none', transition: 'all 0.15s' }}>
            OOS Cases
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select value={datePreset} onChange={e => setDatePreset(e.target.value)}
            style={{ background: DARK, color: '#FFF', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
            {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: MUTED }}>Logout</button>
        </div>
      </div>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 28px', maxWidth: 1400, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: MUTED, fontSize: 14 }}>Loading…</div>
        ) : (
          <>

            {/* ══ MARKETING / OPS DASHBOARD ════════════════════════════════ */}
            {activeTab === 'marketing' && (
              <div>
                {/* Title */}
                <div style={{ marginBottom: 6 }}>
                  <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, margin: 0, color: DARK }}>
                    Ops{' '}
                    <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, color: ACCENT }}>Dashboard</span>
                  </h1>
                </div>
                <p style={{ fontSize: 13, color: MUTED, marginBottom: 28, marginTop: 6 }}>
                  {fmt$(spend)} spent &nbsp;·&nbsp; {totalLeads} leads &nbsp;·&nbsp; CPQ {cpq ? fmt$(cpq) : '—'} &nbsp;·&nbsp; {totalSignedCases} signed cases
                </p>

                {/* Stat cards — 2 dark (CPL + CPQ) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10, marginBottom: 32 }}>
                  <LightCard label="Total Spend"   value={fmt$(spend)} />
                  <LightCard label="Impressions"   value={(totalImpressions || 0).toLocaleString()} />
                  <LightCard label="Clicks"        value={(totalClicks || 0).toLocaleString()} />
                  <LightCard label="Leads"         value={totalLeads} />
                  <DarkCard  label="CPL"           value={cpl ? fmt$(cpl) : '—'}  sub="Cost per lead" />
                  <DarkCard  label="CPQ"           value={cpq ? fmt$(cpq) : '—'}  sub="Cost per qualified" terracotta />
                  <LightCard label="CTR"           value={metaData?.summary?.ctr ? `${metaData.summary.ctr}%` : '—'} />
                  <LightCard label="Signed Cases"  value={totalSignedCases} sub={`${attribution?.totals?.notQualified || 0} NQ`} />
                </div>

                {/* Campaign-grouped creative sections */}
                {sortedGroups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: MUTED, fontSize: 14 }}>No ad data for this period.</div>
                ) : (
                  sortedGroups.map(g => (
                    <CampaignSection
                      key={g.name}
                      name={g.name}
                      ads={g.ads}
                      onClickStage={(ad, stage) => setLeadsModal({ ad, stage })}
                      onClickLeads={ad => setLeadsModal({ ad })}
                    />
                  ))
                )}
              </div>
            )}

            {/* ══ OVERVIEW ═════════════════════════════════════════════════ */}
            {/* ══ HR ═══════════════════════════════════════════════════════ */}
            {activeTab === 'hr' && (() => {
              // Merge time-entry hours into workers
              const teByProfileId: Record<string, any> = {}
              for (const te of timeEntries) teByProfileId[te.profileId] = te

              const workersWithHours = workers.map((w: any) => {
                const te = teByProfileId[w.profileId] || { entries: [] }
                const now = Date.now()
                const hoursToday = (te.entries as any[]).reduce((total: number, e: any) => {
                  const end = e.clock_out ? new Date(e.clock_out).getTime() : now
                  const mins = Math.max(0, (end - new Date(e.clock_in).getTime()) / 60000)
                  return total + mins / 60
                }, 0)
                const clockedIn = (te.entries as any[]).some((e: any) => !e.clock_out)
                return { ...w, hoursToday, clockedIn }
              })

              return (
              <div>
                <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 4, color: DARK }}>
                  Team{' '}
                  <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, color: ACCENT, fontSize: 28 }}>HR</span>
                </h1>
                <p style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>
                  Commission $25/closed case &nbsp;·&nbsp; OT ${6}/hr after 9h &nbsp;·&nbsp; Paid biweekly Friday
                </p>

                {workersWithHours.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
                    <LightCard label="Total Workers"    value={workersWithHours.length} />
                    <LightCard label="Clocked In Now"   value={workersWithHours.filter((w: any) => w.clockedIn).length} />
                    <LightCard label="Period Hours"     value={`${workersWithHours.reduce((s: number, w: any) => s + (w.regularHours || 0) + (w.overtimeHours || 0), 0).toFixed(1)}h`} sub={`${workers[0]?.payPeriodStart || ''} – ${workers[0]?.payPeriodEnd || ''}`} />
                    <LightCard label="Closed Cases"     value={workersWithHours.reduce((s: number, w: any) => s + w.closedCases, 0)} />
                    <DarkCard  label={`Next Payment · ${workers[0]?.nextPaymentDate || ''}`} value={'$' + workersWithHours.reduce((s: number, w: any) => s + (w.nextPayment || 0), 0).toLocaleString()} terracotta />
                  </div>
                )}

                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: DARK }}>All Workers</span>
                    <button onClick={() => { setShowAddWorker(true); setAddError('') }}
                      style={{ background: DARK, color: '#FFF', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      + Add Worker
                    </button>
                  </div>
                  {workersWithHours.length === 0 ? (
                    <p style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>No workers yet.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${BORDER}`, background: '#F5F1EB' }}>
                            {['Worker', 'Rate', 'Hours Today', 'Period Hrs', 'OT Hrs', 'Signed', 'Closed', `Next Payment`, 'Closed by Firm'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {workersWithHours.map((w: any, i: number) => (
                            <>
                              <tr key={w.name + i}
                                style={{ borderBottom: expandedWorker === w.name ? 'none' : `1px solid ${BORDER}`, opacity: w.signedCases === 0 && !w.regularHours ? 0.45 : 1, cursor: w.closedByFirm?.length > 0 ? 'pointer' : 'default', background: expandedWorker === w.name ? '#FAFAF8' : undefined }}
                                onClick={() => w.closedByFirm?.length > 0 && setExpandedWorker(expandedWorker === w.name ? null : w.name)}>
                                <td style={{ padding: '10px 16px', fontWeight: 600, color: DARK }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {w.clockedIn && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} title="Clocked in" />}
                                    {w.name}
                                  </div>
                                </td>
                                <td style={{ padding: '10px 16px', color: MUTED }}>${(w.hourlyRate ?? 5).toFixed(2)}/hr</td>
                                <td style={{ padding: '10px 16px', color: w.hoursToday > 0 ? DARK : '#C4BAB0', fontWeight: w.hoursToday > 0 ? 600 : 400 }}>
                                  {w.hoursToday > 0 ? `${w.hoursToday.toFixed(2)}h` : '—'}
                                </td>
                                <td style={{ padding: '10px 16px', color: DARK, fontWeight: 600 }}>
                                  {w.regularHours > 0 ? `${w.regularHours.toFixed(2)}h` : '—'}
                                </td>
                                <td style={{ padding: '10px 16px', color: w.overtimeHours > 0 ? ACCENT : '#C4BAB0', fontWeight: w.overtimeHours > 0 ? 700 : 400 }}>
                                  {w.overtimeHours > 0 ? `${w.overtimeHours.toFixed(2)}h` : '—'}
                                </td>
                                <td style={{ padding: '10px 16px', fontWeight: 700, color: DARK }}>{w.signedCases}</td>
                                <td style={{ padding: '10px 16px', fontWeight: 700, color: '#15803D' }}>{w.closedCases}</td>
                                <td style={{ padding: '10px 16px', fontWeight: 700, color: w.nextPayment > 0 ? DARK : '#C4BAB0' }}>
                                  {w.nextPayment > 0 ? (
                                    <span title={`Base $${w.basePay?.toFixed(2)} + Commission $${w.commissionInPeriod}`}>
                                      ${w.nextPayment.toLocaleString()}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td style={{ padding: '10px 16px', color: MUTED, fontSize: 11 }}>
                                  {w.closedByFirm?.length > 0
                                    ? <span style={{ color: ACCENT }}>{expandedWorker === w.name ? '▲ hide' : `▼ ${w.closedByFirm.length} firm${w.closedByFirm.length > 1 ? 's' : ''}`}</span>
                                    : '—'}
                                </td>
                              </tr>
                              {expandedWorker === w.name && w.closedByFirm?.length > 0 && (
                                <tr key={w.name + '-firms'} style={{ borderBottom: `1px solid ${BORDER}`, background: '#F5F1EB' }}>
                                  <td colSpan={9} style={{ padding: '8px 16px 12px 32px' }}>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                      {w.closedByFirm.map((f: any) => (
                                        <div key={f.firmId} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 14px', fontSize: 12 }}>
                                          <span style={{ fontWeight: 700, color: DARK }}>{f.firmName}</span>
                                          <span style={{ color: MUTED, marginLeft: 8 }}>{f.signedCases} signed</span>
                                          <span style={{ color: '#15803D', fontWeight: 700, marginLeft: 8 }}>{f.closedCases} closed</span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))}
                          <tr style={{ background: '#F5F1EB', borderTop: `2px solid ${BORDER}` }}>
                            <td style={{ padding: '10px 16px', fontWeight: 700, color: MUTED }}>Total</td>
                            <td></td>
                            <td style={{ padding: '10px 16px', fontWeight: 700, color: DARK }}>
                              {workersWithHours.reduce((s: number, w: any) => s + w.hoursToday, 0).toFixed(1)}h
                            </td>
                            <td style={{ padding: '10px 16px', fontWeight: 700, color: DARK }}>
                              {workersWithHours.reduce((s: number, w: any) => s + (w.regularHours || 0), 0).toFixed(1)}h
                            </td>
                            <td style={{ padding: '10px 16px', fontWeight: 700, color: ACCENT }}>
                              {workersWithHours.reduce((s: number, w: any) => s + (w.overtimeHours || 0), 0).toFixed(1)}h
                            </td>
                            <td style={{ padding: '10px 16px', fontWeight: 700, color: DARK }}>{workersWithHours.reduce((s: number, w: any) => s + w.signedCases, 0)}</td>
                            <td style={{ padding: '10px 16px', fontWeight: 700, color: '#15803D' }}>{workersWithHours.reduce((s: number, w: any) => s + w.closedCases, 0)}</td>
                            <td style={{ padding: '10px 16px', fontWeight: 700, color: DARK }}>${workersWithHours.reduce((s: number, w: any) => s + (w.nextPayment || 0), 0).toLocaleString()}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Add Worker Modal */}
                {(showAddWorker || createdWorker) && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 360 }}>
                      {createdWorker ? (
                        <>
                          <p style={{ fontWeight: 700, fontSize: 15, color: DARK, marginBottom: 16 }}>Worker Created</p>
                          <div style={{ background: '#F5F0E8', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                            <p style={{ fontSize: 11, color: MUTED, marginBottom: 2 }}>Name</p><p style={{ fontWeight: 600, color: DARK }}>{createdWorker.name}</p>
                            <p style={{ fontSize: 11, color: MUTED, marginBottom: 2, marginTop: 10 }}>Temp Password</p><p style={{ fontFamily: 'monospace', color: DARK }}>{createdWorker.password}</p>
                            <p style={{ fontSize: 11, color: MUTED, marginBottom: 2, marginTop: 10 }}>Login URL</p><p style={{ fontSize: 12, color: ACCENT, fontFamily: 'monospace' }}>teams.case-bridge.com/teams/login</p>
                          </div>
                          <button onClick={() => { setCreatedWorker(null); setShowAddWorker(false) }} style={{ width: '100%', background: '#F5F0E8', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 0', fontSize: 13, color: DARK, cursor: 'pointer' }}>Done</button>
                        </>
                      ) : (
                        <>
                          <p style={{ fontWeight: 700, fontSize: 15, color: DARK, marginBottom: 16 }}>Add Worker</p>
                          <form onSubmit={handleAddWorker} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Full Name</label>
                              <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Pablo Hernandez" style={inputStyle} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Password</label>
                              <input type="password" value={addPassword} onChange={e => setAddPassword(e.target.value)} placeholder="Temporary password" style={inputStyle} />
                            </div>
                            {addError && <p style={{ color: '#B91C1C', fontSize: 12 }}>{addError}</p>}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button type="submit" disabled={addLoading} style={{ flex: 1, background: DARK, color: '#FFF', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: addLoading ? 0.6 : 1 }}>{addLoading ? 'Creating…' : 'Create Worker'}</button>
                              <button type="button" onClick={() => setShowAddWorker(false)} style={{ flex: 1, background: '#F5F0E8', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 0', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                            </div>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              )
            })()}

            {/* ══ FIRMS ════════════════════════════════════════════════════ */}
            {activeTab === 'firms' && (
              <div>
                <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 4, color: DARK }}>
                  Client{' '}
                  <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, color: ACCENT, fontSize: 28 }}>Firms</span>
                </h1>
                <p style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>Click a firm to open its dashboard.</p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <button onClick={() => setShowAddFirm(true)}
                    style={{ background: DARK, color: '#FFF', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Firm</button>
                </div>

                {firms.length === 0 ? (
                  <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '60px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>No firms configured yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    {firms.map((firm: any) => (
                      <Link key={firm.id} href={`/metrics/firms/${firm.slug}`} style={{ display: 'block', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20, textDecoration: 'none', transition: 'border-color 0.15s' }}>
                        <p style={{ fontWeight: 700, fontSize: 15, color: DARK, marginBottom: 4 }}>{firm.name}</p>
                        <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>Case value: ${firm.case_value?.toLocaleString()} · {firm.meta_account_id ? 'Meta connected' : 'No Meta'}</p>
                        <p style={{ fontSize: 11, color: '#B5AFA8' }}>Initial ≤${firm.phase_initial_max_weekly_spend?.toLocaleString()}/wk · Scale ≤${firm.phase_scale_max_weekly_spend?.toLocaleString()}/wk</p>
                      </Link>
                    ))}
                  </div>
                )}

                {showAddFirm && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <p style={{ fontWeight: 700, fontSize: 15, color: DARK }}>Add Firm</p>
                        <button onClick={() => { setShowAddFirm(false); setFirmError(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: MUTED }}>×</button>
                      </div>
                      <form onSubmit={addFirm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div style={{ gridColumn: '1/-1' }}>
                            <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>Firm Name *</label>
                            <input value={firmForm.name} onChange={e => setFirmForm(f => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }))} placeholder="e.g. Georgia-MCA" required style={inputStyle} />
                          </div>
                          {[
                            { label: 'Slug *', key: 'slug', placeholder: 'e.g. mca' },
                            { label: 'Case Value ($)', key: 'case_value', placeholder: '2000', type: 'number' },
                            { label: 'Meta Account ID', key: 'meta_account_id', placeholder: 'act_123...' },
                            { label: 'Initial Phase Max ($/wk)', key: 'phase_initial', type: 'number' },
                            { label: 'Scale Phase Max ($/wk)', key: 'phase_scale', type: 'number' },
                            { label: 'Replacement Window (days)', key: 'replacement_window_days', type: 'number' },
                            { label: 'Sanguine Rate ($/closed case)', key: 'sanguine_rate', type: 'number' },
                          ].map((f: any) => (
                            <div key={f.key}>
                              <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4 }}>{f.label}</label>
                              <input type={f.type || 'text'} value={(firmForm as any)[f.key]} onChange={e => setFirmForm(ff => ({ ...ff, [f.key]: e.target.value }))} placeholder={f.placeholder} style={inputStyle} />
                            </div>
                          ))}
                        </div>
                        {firmError && <p style={{ color: '#B91C1C', fontSize: 12 }}>{firmError}</p>}
                        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                          <button type="submit" disabled={firmSaving} style={{ flex: 1, background: DARK, color: '#FFF', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: firmSaving ? 0.6 : 1 }}>{firmSaving ? 'Saving...' : 'Create Firm'}</button>
                          <button type="button" onClick={() => { setShowAddFirm(false); setFirmError(null) }} style={{ padding: '9px 20px', background: '#F5F0E8', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {leadsModal && (
        <CreativeLeadsModal
          ad={leadsModal.ad}
          filterStage={leadsModal.stage}
          onClose={() => setLeadsModal(null)}
        />
      )}
    </div>
  )
}
