'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const DATE_PRESETS = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: 'last_7d' },
  { label: 'Last 14 days', value: 'last_14d' },
  { label: 'Last 30 days', value: 'last_30d' },
]

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value ?? '—'}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function Table({ columns, rows }: { columns: string[]; rows: any[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            {columns.map(c => (
              <th key={c} className="text-left text-gray-400 font-medium py-3 px-4 text-xs uppercase tracking-wider">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
              {row.map((cell, j) => (
                <td key={j} className="py-3 px-4 text-gray-200">{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Marketing helpers (mirrors firm marketing page) ───────────────────────

function alertLevel(ad: any): 'kill' | 'watch' | 'floor' | 'read_decide' | 'scale' | null {
  const spend = ad.spend ?? 0
  const leads = ad.metaLeads ?? ad.leads ?? 0
  const cpl = ad.cpl ?? null
  const cpq = ad.cpq != null ? parseFloat(ad.cpq) : null
  const signed = ad.signedCases ?? 0
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

function AlertBadge({ level }: { level: ReturnType<typeof alertLevel> }) {
  if (!level) return null
  const cfg = {
    kill:        { cls: 'bg-red-900/40 text-red-400 border-red-700/40',         label: 'KILL' },
    watch:       { cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40', label: 'WATCH' },
    floor:       { cls: 'bg-gray-800 text-gray-400 border-gray-700',             label: 'FLOOR' },
    read_decide: { cls: 'bg-orange-900/40 text-orange-400 border-orange-700/40', label: 'READ & DECIDE' },
    scale:       { cls: 'bg-green-900/40 text-green-400 border-green-700/40',    label: 'SCALE ↑' },
  }[level]
  return <span className={`text-[10px] border px-1.5 py-0.5 rounded font-semibold ${cfg.cls}`}>{cfg.label}</span>
}

function CreativeNameCell({ name, firmSlug }: { name: string; firmSlug: string | null }) {
  const [show, setShow] = useState(false)
  return (
    <td className="py-3 px-4 max-w-[200px]">
      <div className="relative inline-block w-full" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
        {firmSlug ? (
          <Link href={`/metrics/firms/${firmSlug}`} className="text-gray-200 hover:text-blue-400 transition truncate block">{name || '—'}</Link>
        ) : (
          <p className="text-gray-200 truncate cursor-default">{name || '—'}</p>
        )}
        {show && name && (
          <div className="absolute z-50 left-0 top-full mt-1.5 w-max max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 shadow-xl pointer-events-none">{name}</div>
        )}
      </div>
      {firmSlug && <p className="text-[10px] text-gray-600 mt-0.5">{firmSlug}</p>}
    </td>
  )
}

function fmt$(n: number | null | undefined) {
  if (n == null) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function MarketingPanel({ ads, campaigns, adsets, subTab, setSubTab }: {
  ads: any[]; campaigns: any[]; adsets: any[]
  subTab: 'campaigns' | 'adsets' | 'ads'
  setSubTab: (t: 'campaigns' | 'adsets' | 'ads') => void
}) {
  const killCount = ads.filter(a => alertLevel(a) === 'kill').length
  const watchCount = ads.filter(a => alertLevel(a) === 'watch').length
  const scaleCount = ads.filter(a => alertLevel(a) === 'scale').length
  const readDecideCount = ads.filter(a => alertLevel(a) === 'read_decide').length
  const activeCount = ads.filter((a: any) => a.isActive).length

  // Adset aggregation from ad-level data
  const adsetMap: Record<string, any> = {}
  for (const a of ads) {
    const key = a.adsetId || a.adsetName || '—'
    if (!adsetMap[key]) adsetMap[key] = { name: a.adsetName || '—', spend: 0, metaLeads: 0, signedCases: 0, impressions: 0, adCount: 0 }
    adsetMap[key].spend += a.spend; adsetMap[key].metaLeads += (a.metaLeads ?? a.leads ?? 0)
    adsetMap[key].signedCases += a.signedCases; adsetMap[key].impressions += a.impressions; adsetMap[key].adCount += 1
  }
  const aggAdsets = Object.values(adsetMap).sort((a: any, b: any) => b.spend - a.spend)

  // Campaign aggregation
  const campMap: Record<string, any> = {}
  for (const a of ads) {
    const key = a.campaignId || a.campaignName || '—'
    if (!campMap[key]) campMap[key] = { name: a.campaignName || '—', spend: 0, metaLeads: 0, signedCases: 0, impressions: 0, adCount: 0 }
    campMap[key].spend += a.spend; campMap[key].metaLeads += (a.metaLeads ?? a.leads ?? 0)
    campMap[key].signedCases += a.signedCases; campMap[key].impressions += a.impressions; campMap[key].adCount += 1
  }
  const aggCampaigns = Object.values(campMap).sort((a: any, b: any) => b.spend - a.spend)

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      {(killCount > 0 || watchCount > 0 || scaleCount > 0 || readDecideCount > 0) && (
        <div className="rounded-xl border border-gray-700/40 bg-gray-900 px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
          {killCount > 0 && <span className="text-red-400 font-semibold">{killCount} kill</span>}
          {watchCount > 0 && <span className="text-yellow-400">{watchCount} watch</span>}
          {readDecideCount > 0 && <span className="text-orange-400">{readDecideCount} read & decide</span>}
          {scaleCount > 0 && <span className="text-green-400 font-semibold">{scaleCount} ready to scale ↑</span>}
          <span className="text-gray-600 text-xs ml-auto">Phase logic</span>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['ads', 'adsets', 'campaigns'] as const).map(v => (
            <button key={v} onClick={() => setSubTab(v)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${subTab === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {v === 'ads' ? 'Creatives' : v === 'adsets' ? 'Ad Sets' : 'Campaigns'}
            </button>
          ))}
        </div>
        {subTab === 'ads' && activeCount > 0 && (
          <span className="text-xs text-blue-400">{activeCount} active today</span>
        )}
      </div>

      {/* Creatives table */}
      {subTab === 'ads' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-300">Creatives</p>
            <span className="text-xs text-gray-600">{ads.length} ads</span>
          </div>
          {ads.length === 0 ? (
            <p className="text-gray-500 text-sm p-6 text-center">No ad data for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['', 'Creative', 'Ad Set', 'Spend', 'Leads', 'CPL', 'CPC', 'CTR', 'Click→Lead', 'LPV→Lead', 'NR', 'NQ', 'F/U', 'Signed', 'CPQ', 'Phase'].map(c => (
                      <th key={c} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ads.map((a: any, i: number) => {
                    const level = alertLevel(a)
                    const cpl = a.cpl != null ? parseFloat(String(a.cpl)) : null
                    const cpq = a.cpq != null ? parseFloat(String(a.cpq)) : null
                    const metaLeads = a.metaLeads ?? a.leads ?? 0
                    return (
                      <tr key={i} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${!a.isActive ? 'opacity-50' : ''} ${level === 'kill' ? 'bg-red-950/10' : level === 'watch' ? 'bg-yellow-950/10' : level === 'scale' ? 'bg-green-950/10' : ''}`}>
                        <td className="py-3 px-3 w-6">
                          <span className={`block w-2 h-2 rounded-full ${a.isActive ? 'bg-green-500' : 'bg-gray-700'}`} title={a.isActive ? 'Active' : 'Paused'} />
                        </td>
                        <CreativeNameCell name={a.name || a.adName} firmSlug={a.firmSlug} />
                        <td className="py-3 px-4 max-w-[160px]">
                          <p className="text-gray-400 text-xs truncate" title={a.adsetName}>{a.adsetName || '—'}</p>
                        </td>
                        <td className="py-3 px-4 text-gray-200 whitespace-nowrap">{fmt$(a.spend)}</td>
                        <td className="py-3 px-4">
                          {metaLeads > 0 ? <span className="text-gray-300">{metaLeads}</span> : <span className="text-gray-600">0</span>}
                        </td>
                        <td className="py-3 px-4">
                          <span className={cpl == null ? 'text-gray-600' : cpl > 300 ? 'text-red-400 font-semibold' : cpl > 220 ? 'text-yellow-400' : 'text-gray-300'}>
                            {cpl != null ? fmt$(cpl) : '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400">{a.cpc ? fmt$(a.cpc) : '—'}</td>
                        <td className="py-3 px-4">
                          <span className={a.ctr > 10 ? 'text-yellow-400' : 'text-gray-400'}>{a.ctr ? a.ctr.toFixed(2) + '%' : '—'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={a.clickToLeadPct != null && a.clickToLeadPct < 0.5 ? 'text-red-400 font-semibold' : 'text-gray-400'}>
                            {a.clickToLeadPct != null ? a.clickToLeadPct.toFixed(2) + '%' : '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400">{a.lpvToLeadPct != null ? a.lpvToLeadPct.toFixed(2) + '%' : '—'}</td>
                        <td className="py-3 px-4 text-xs">
                          {a.nrCount > 0 ? <span className="text-gray-400">{a.nrCount}</span> : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {a.nqCount > 0 ? <span className="text-red-400">{a.nqCount}</span> : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {a.fuCount > 0 ? <span className="text-blue-400">{a.fuCount}</span> : <span className="text-gray-700">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          {a.signedCases > 0 ? (
                            <div>
                              <span className="text-green-400 font-semibold">{a.signedCases}</span>
                              {a.firmName && <p className="text-[10px] text-gray-500 mt-0.5">{a.firmName}</p>}
                            </div>
                          ) : <span className="text-gray-600">0</span>}
                        </td>
                        <td className="py-3 px-4">
                          {cpq != null
                            ? <span className={cpq <= 1200 ? 'text-green-400 font-semibold' : cpq > 2000 ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>{fmt$(cpq)}</span>
                            : <span className="text-gray-600">—</span>}
                        </td>
                        <td className="py-3 px-4"><AlertBadge level={level} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Ad Sets table */}
      {subTab === 'adsets' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800"><p className="text-sm font-medium text-gray-300">Ad Sets</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Ad Set', 'Spend', 'Impressions', 'Leads', 'Signed', 'Conv %', 'CPQ', 'Ads'].map(c => (
                    <th key={c} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aggAdsets.map((a: any, i: number) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                    <td className="py-3 px-4 max-w-[240px]"><p className="text-gray-200 truncate" title={a.name}>{a.name}</p></td>
                    <td className="py-3 px-4 text-gray-200 whitespace-nowrap">{fmt$(a.spend)}</td>
                    <td className="py-3 px-4 text-gray-400">{a.impressions?.toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-300">{a.metaLeads}</td>
                    <td className="py-3 px-4 font-semibold text-green-400">{a.signedCases}</td>
                    <td className="py-3 px-4 text-gray-400">{a.metaLeads > 0 ? (a.signedCases / a.metaLeads * 100).toFixed(1) + '%' : '—'}</td>
                    <td className="py-3 px-4">{a.signedCases > 0 ? (() => { const c = a.spend / a.signedCases; return <span className={c <= 1200 ? 'text-green-400 font-semibold' : c > 2000 ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>{fmt$(c)}</span> })() : <span className="text-gray-600">—</span>}</td>
                    <td className="py-3 px-4 text-gray-500">{a.adCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaigns table */}
      {subTab === 'campaigns' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800"><p className="text-sm font-medium text-gray-300">Campaigns</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Campaign', 'Spend', 'Impressions', 'Leads', 'Signed', 'Conv %', 'CPQ', 'Ads'].map(c => (
                    <th key={c} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aggCampaigns.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                    <td className="py-3 px-4 max-w-[240px]"><p className="text-gray-200 truncate" title={c.name}>{c.name}</p></td>
                    <td className="py-3 px-4 text-gray-200 whitespace-nowrap">{fmt$(c.spend)}</td>
                    <td className="py-3 px-4 text-gray-400">{c.impressions?.toLocaleString()}</td>
                    <td className="py-3 px-4 text-gray-300">{c.metaLeads}</td>
                    <td className="py-3 px-4 font-semibold text-green-400">{c.signedCases}</td>
                    <td className="py-3 px-4 text-gray-400">{c.metaLeads > 0 ? (c.signedCases / c.metaLeads * 100).toFixed(1) + '%' : '—'}</td>
                    <td className="py-3 px-4">{c.signedCases > 0 ? (() => { const q = c.spend / c.signedCases; return <span className={q <= 1200 ? 'text-green-400 font-semibold' : q > 2000 ? 'text-red-400 font-semibold' : 'text-yellow-400 font-semibold'}>{fmt$(q)}</span> })() : <span className="text-gray-600">—</span>}</td>
                    <td className="py-3 px-4 text-gray-500">{c.adCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const BLANK_FIRM = { name: '', slug: '', case_value: '', meta_account_id: 'act_788484706914452', phase_initial: '5600', phase_scale: '11200', replacement_window_days: '14', sanguine_rate: '250' }

export default function MetricsPage() {
  const router = useRouter()
  const [datePreset, setDatePreset] = useState('today')
  const [metaData, setMetaData] = useState<any>(null)
  const [attribution, setAttribution] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'marketing' | 'hr' | 'firms'>('overview')
  const [marketingSubTab, setMarketingSubTab] = useState<'campaigns' | 'adsets' | 'ads'>('ads')
  const [creativeOverview, setCreativeOverview] = useState<Record<string, any>>({})
  const [pipelineOverview, setPipelineOverview] = useState<Record<string, any>>({})
  const [workers, setWorkers] = useState<any[]>([])
  const [showAddWorker, setShowAddWorker] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [createdWorker, setCreatedWorker] = useState<{ name: string; password: string } | null>(null)
  const [firms, setFirms] = useState<any[]>([])
  const [showAddFirm, setShowAddFirm] = useState(false)
  const [firmForm, setFirmForm] = useState(BLANK_FIRM)
  const [firmSaving, setFirmSaving] = useState(false)
  const [firmError, setFirmError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    let cancelled = false

    const metaPromise = fetch(`/api/metrics?date_preset=${datePreset}`)
      .then(r => r.json())
      .catch(e => ({ error: (e as Error).message }))
      .then(d => {
        if (!cancelled) setMetaData(d)
      })

    const attrPromise = fetch('/api/metrics/attribution')
      .then(r => r.json())
      .catch(e => ({ error: (e as Error).message }))
      .then(d => {
        if (!cancelled) setAttribution(d)
      })

    Promise.allSettled([metaPromise, attrPromise]).then(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [datePreset])

  useEffect(() => {
    let cancelled = false
    fetch('/api/metrics/firms')
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setFirms(d.firms || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    fetch('/api/metrics/workers')
      .then(r => r.json())
      .then(d => setWorkers(d.workers || []))
      .catch(() => {})
  }, [])

  // Fast: signed cases + firm from Supabase (no GHL calls)
  useEffect(() => {
    fetch('/api/metrics/creative-overview')
      .then(r => r.json())
      .then(d => setCreativeOverview(d.byAdId || {}))
      .catch(() => {})
  }, [])

  // Slow: GHL pipeline NR/NQ/FU counts (runs in background)
  useEffect(() => {
    fetch('/api/metrics/creative-overview?pipeline=1')
      .then(r => r.json())
      .then(d => setPipelineOverview(d.byAdId || {}))
      .catch(() => {})
  }, [])

  async function handleAddWorker(e: React.FormEvent) {
    e.preventDefault()
    if (!addName.trim() || !addPassword.trim()) { setAddError('Name and password are required.'); return }
    setAddLoading(true); setAddError('')
    const res = await fetch('/api/teams/admin/reps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName.trim(), password: addPassword }),
    })
    const data = await res.json()
    setAddLoading(false)
    if (!res.ok) { setAddError(data.error || 'Failed to create worker.'); return }
    setCreatedWorker({ name: addName.trim(), password: addPassword })
    setAddName(''); setAddPassword('')
    setWorkers(prev => [...prev, { id: data.id, name: addName.trim() }])
  }

  async function addFirm(e: React.FormEvent) {
    e.preventDefault()
    setFirmSaving(true)
    setFirmError(null)
    const res = await fetch('/api/metrics/firms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: firmForm.name,
        slug: firmForm.slug,
        case_value: firmForm.case_value,
        meta_account_id: firmForm.meta_account_id,
        phase_initial_max_weekly_spend: firmForm.phase_initial,
        phase_scale_max_weekly_spend: firmForm.phase_scale,
        replacement_window_days: firmForm.replacement_window_days,
        sanguine_rate_per_closed_case: firmForm.sanguine_rate,
      }),
    })
    const data = await res.json()
    setFirmSaving(false)
    if (data.error) { setFirmError(data.error); return }
    setFirms(prev => [...prev, data.firm])
    setShowAddFirm(false)
    setFirmForm(BLANK_FIRM)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const totalSignedCases = workers.reduce((s: number, w: any) => s + w.signedCases, 0)
  const spend = parseFloat(metaData?.summary?.spend || 0)
  const cpq = totalSignedCases > 0 ? (spend / totalSignedCases).toFixed(2) : null

  // Merge creative overview data with Meta ad data
  const adsWithAttribution = (metaData?.ads || []).map((ad: any) => {
    const ov = creativeOverview[ad.id] || {}
    const pl = pipelineOverview[ad.id] || {}
    const signedCases = ov.signedCases || 0
    const cpq = signedCases > 0 ? ad.spend / signedCases : null
    // Active = has spend today (most reliable signal) OR flagged active
    const isActive = ad.spend > 0
    return {
      ...ad,
      signedCases,
      cpq,
      isActive,
      firmSlug: ov.firmSlug || null,
      firmName: ov.firmName || null,
      nrCount: pl.nrCount || 0,
      nqCount: pl.nqCount || 0,
      fuCount: pl.fuCount || 0,
    }
  }).sort((a: any, b: any) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return b.spend - a.spend
  })

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-white">CaseBridge <span className="text-gray-500 font-normal text-sm">Metrics</span></h1>
          <div className="flex gap-1">
            {(['overview', 'marketing', 'hr', 'firms'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${activeTab === tab ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {tab === 'hr' ? 'HR' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={datePreset}
            onChange={e => setDatePreset(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none"
          >
            {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={logout} className="text-gray-400 hover:text-white text-sm transition">Logout</button>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                  <StatCard label="Total Spend" value={`$${spend.toLocaleString()}`} />
                  <StatCard label="Impressions" value={metaData?.summary?.impressions?.toLocaleString()} />
                  <StatCard label="Clicks" value={metaData?.summary?.clicks?.toLocaleString()} />
                  <StatCard label="CTR" value={`${metaData?.summary?.ctr}%`} />
                  <StatCard label="Leads" value={metaData?.summary?.leads} />
                  <StatCard label="CPL" value={metaData?.summary?.cpl ? `$${metaData.summary.cpl}` : '—'} />
                  <StatCard label="CPQ" value={cpq ? `$${cpq}` : '—'} sub="Cost per qualified" />
                  <StatCard label="Signed Cases" value={totalSignedCases} sub={`${attribution?.totals?.notQualified || 0} NQ`} />
                </div>

                {/* Cost per signed case */}
                {attribution?.totals?.signedCases > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <StatCard
                      label="Cost Per Signed Case"
                      value={`$${(parseFloat(metaData?.summary?.spend) / attribution.totals.signedCases).toFixed(2)}`}
                      sub="Total spend ÷ signed cases"
                    />
                    <StatCard
                      label="Sign Rate"
                      value={`${metaData?.summary?.leads > 0 ? ((attribution.totals.signedCases / metaData.summary.leads) * 100).toFixed(1) : 0}%`}
                      sub="Leads → Signed Cases"
                    />
                    <StatCard
                      label="NQ Rate"
                      value={`${metaData?.summary?.leads > 0 ? ((attribution.totals.notQualified / metaData.summary.leads) * 100).toFixed(1) : 0}%`}
                      sub="Leads → Not Qualified"
                    />
                  </div>
                )}

                {/* Daily spend + leads chart */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-medium text-gray-300 mb-4">Daily Spend & Leads</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={metaData?.daily || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                      <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#3b82f6" name="Spend ($)" dot={false} strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="leads" stroke="#10b981" name="Leads" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Daily spend bar chart */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-medium text-gray-300 mb-4">Daily Spend</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={metaData?.daily || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                      <Bar dataKey="spend" fill="#3b82f6" name="Spend ($)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Marketing Tab */}
            {activeTab === 'marketing' && (
              <MarketingPanel
                ads={adsWithAttribution}
                campaigns={metaData?.campaigns || []}
                adsets={metaData?.adsets || []}
                subTab={marketingSubTab}
                setSubTab={setMarketingSubTab}
              />
            )}

            {/* HR Tab */}
            {activeTab === 'hr' && (
              <div className="space-y-5">
                {/* Pay structure info */}
                <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
                  <span className="bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
                    Base pay: <span className="text-gray-300">$5 / hr</span>
                  </span>
                  <span className="bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
                    Commission: <span className="text-gray-300">$25 / closed case</span>
                  </span>
                </div>

                {/* Summary cards */}
                {workers.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Workers', value: workers.length },
                      { label: 'Total Signed Cases', value: workers.reduce((s: number, w: any) => s + w.signedCases, 0) },
                      { label: 'Total Closed Cases', value: workers.reduce((s: number, w: any) => s + w.closedCases, 0) },
                      { label: 'Total Commission', value: '$' + workers.reduce((s: number, w: any) => s + w.commission, 0).toLocaleString() },
                    ].map(c => (
                      <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                        <p className="text-lg font-bold text-white">{c.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Workers table */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-300">All Workers</p>
                    <button onClick={() => { setShowAddWorker(true); setAddError('') }}
                      className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition">
                      + Add Worker
                    </button>
                  </div>
                  {workers.length === 0 ? (
                    <p className="text-gray-500 text-sm p-6 text-center">No workers yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-800">
                            {['Worker', 'Signed Cases', 'Closed Cases', 'Close Rate', 'Commission', 'Total Pay'].map(c => (
                              <th key={c} className="text-left text-xs text-gray-500 font-medium py-3 px-4 uppercase tracking-wider whitespace-nowrap">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {workers.map((w: any, i: number) => (
                            <tr key={i} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${w.signedCases === 0 ? 'opacity-50' : ''}`}>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-200 font-medium">{w.name}</span>
                                  {w.signedCases === 0 && (
                                    <span className="text-[10px] bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded">not started</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-white font-semibold">{w.signedCases}</td>
                              <td className="py-3 px-4 text-green-400 font-semibold">{w.closedCases}</td>
                              <td className="py-3 px-4 text-gray-400">{w.signedCases > 0 ? `${w.closeRate}%` : '—'}</td>
                              <td className="py-3 px-4 text-blue-400">{w.commission > 0 ? '$' + w.commission.toLocaleString() : '—'}</td>
                              <td className="py-3 px-4 text-gray-400 text-xs italic">Base ($5/hr) + {w.commission > 0 ? '$' + w.commission.toLocaleString() : '$0'} commission</td>
                            </tr>
                          ))}
                          {workers.length > 0 && (
                            <tr className="border-t border-gray-700 bg-gray-800/30">
                              <td className="py-3 px-4 text-gray-400 font-medium">Total</td>
                              <td className="py-3 px-4 text-white font-semibold">{workers.reduce((s: number, w: any) => s + w.signedCases, 0)}</td>
                              <td className="py-3 px-4 text-green-400 font-semibold">{workers.reduce((s: number, w: any) => s + w.closedCases, 0)}</td>
                              <td className="py-3 px-4 text-gray-500">—</td>
                              <td className="py-3 px-4 text-blue-400 font-semibold">${workers.reduce((s: number, w: any) => s + w.commission, 0).toLocaleString()}</td>
                              <td className="py-3 px-4 text-gray-500">—</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {(showAddWorker || createdWorker) && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
                      {createdWorker ? (
                        <>
                          <h2 className="text-base font-semibold text-white">Worker Created</h2>
                          <div className="bg-gray-800 rounded-xl p-4 space-y-3 text-sm">
                            <div><p className="text-xs text-gray-500 mb-0.5">Name</p><p className="text-white font-medium">{createdWorker.name}</p></div>
                            <div><p className="text-xs text-gray-500 mb-0.5">Temp Password</p><p className="text-white font-mono">{createdWorker.password}</p></div>
                            <div><p className="text-xs text-gray-500 mb-0.5">Login URL</p><p className="text-blue-400 font-mono text-xs">teams.case-bridge.com/teams/login</p></div>
                          </div>
                          <button onClick={() => { setCreatedWorker(null); setShowAddWorker(false) }}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition">Done</button>
                        </>
                      ) : (
                        <>
                          <h2 className="text-base font-semibold text-white">Add Worker</h2>
                          <form onSubmit={handleAddWorker} className="space-y-3">
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">Full Name</label>
                              <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Pablo Hernandez"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">Password</label>
                              <input type="password" value={addPassword} onChange={e => setAddPassword(e.target.value)} placeholder="Temporary password"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500" />
                            </div>
                            {addError && <p className="text-xs text-red-400">{addError}</p>}
                            <div className="flex gap-2 pt-1">
                              <button type="submit" disabled={addLoading}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition">
                                {addLoading ? 'Creating…' : 'Create Worker'}
                              </button>
                              <button type="button" onClick={() => setShowAddWorker(false)}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition">Cancel</button>
                            </div>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Firms Tab */}
            {activeTab === 'firms' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-300">Firms</h2>
                  <button
                    onClick={() => setShowAddFirm(true)}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition"
                  >
                    + Add Firm
                  </button>
                </div>

                {firms.length === 0 ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl px-6 py-12 text-center text-gray-500">
                    No firms configured yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {firms.map((firm: any) => (
                      <Link
                        key={firm.id}
                        href={`/metrics/firms/${firm.slug}`}
                        className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-6 transition group"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-white group-hover:text-blue-400 transition">{firm.name}</h3>
                            <p className="text-gray-500 text-xs mt-1">Case value: ${firm.case_value?.toLocaleString()} · {firm.meta_account_id ? 'Meta connected' : 'No Meta account'}</p>
                          </div>
                          <span className="text-gray-400 group-hover:text-white transition text-sm">→</span>
                        </div>
                        <div className="mt-4 text-xs text-gray-600">
                          Phase thresholds: Initial ≤${firm.phase_initial_max_weekly_spend?.toLocaleString()}/wk · Scale ≤${firm.phase_scale_max_weekly_spend?.toLocaleString()}/wk · Max above
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Add Firm Modal */}
                {showAddFirm && (
                  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg">
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-base font-semibold text-white">Add Firm</h2>
                        <button onClick={() => { setShowAddFirm(false); setFirmError(null) }} className="text-gray-500 hover:text-white text-xl">×</button>
                      </div>
                      <form onSubmit={addFirm} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-400 mb-1">Firm Name *</label>
                            <input value={firmForm.name} onChange={e => setFirmForm(f => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }))}
                              placeholder="e.g. Georgia-MCA" required
                              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Slug * <span className="text-gray-600">(URL key)</span></label>
                            <input value={firmForm.slug} onChange={e => setFirmForm(f => ({ ...f, slug: e.target.value }))}
                              placeholder="e.g. mca" required
                              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Case Value ($)</label>
                            <input type="number" value={firmForm.case_value} onChange={e => setFirmForm(f => ({ ...f, case_value: e.target.value }))}
                              placeholder="2000"
                              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Meta Account ID</label>
                            <input value={firmForm.meta_account_id} onChange={e => setFirmForm(f => ({ ...f, meta_account_id: e.target.value }))}
                              placeholder="act_123..."
                              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Initial Phase Max ($/wk)</label>
                            <input type="number" value={firmForm.phase_initial} onChange={e => setFirmForm(f => ({ ...f, phase_initial: e.target.value }))}
                              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Scale Phase Max ($/wk)</label>
                            <input type="number" value={firmForm.phase_scale} onChange={e => setFirmForm(f => ({ ...f, phase_scale: e.target.value }))}
                              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Replacement Window (days)</label>
                            <input type="number" value={firmForm.replacement_window_days} onChange={e => setFirmForm(f => ({ ...f, replacement_window_days: e.target.value }))}
                              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Sanguine Rate ($/closed case)</label>
                            <input type="number" value={firmForm.sanguine_rate} onChange={e => setFirmForm(f => ({ ...f, sanguine_rate: e.target.value }))}
                              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                          </div>
                        </div>
                        {firmError && <p className="text-red-400 text-xs">{firmError}</p>}
                        <div className="flex gap-2 pt-1">
                          <button type="submit" disabled={firmSaving}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded-lg transition disabled:opacity-50">
                            {firmSaving ? 'Saving...' : 'Create Firm'}
                          </button>
                          <button type="button" onClick={() => { setShowAddFirm(false); setFirmError(null) }}
                            className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm py-2 rounded-lg transition">
                            Cancel
                          </button>
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
    </div>
  )
}
