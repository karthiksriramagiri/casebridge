'use client'

import { useEffect, useState, useCallback } from 'react'

const BG     = '#EDEAE3'
const CARD   = '#FFFFFF'
const DARK   = '#1A1A1A'
const BORDER = '#D4CEBF'
const MUTED  = '#7A7468'
const ACCENT = '#C17A4A'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const YELLOW = '#eab308'
const BLUE   = '#3b82f6'

interface Photo { name: string; url: string; mediaType: string; dateAdded: string | null }
interface PhotoState { loading: boolean; error?: string; images?: Photo[] }

interface Lead {
  contactId: string
  contactName: string | null
  phone: string | null
  email: string | null
  firm: string
  pipelineStage: string | null
  opportunityId: string | null
  createdAt: string | null
  fillStatus: string | null
  scheduledAt: string | null
  completedAt: string | null
  fieldsWritten: Record<string, string> | null
  fieldsSkipped: Record<string, string> | null
  flags: string[] | null
  summary: string | null
  error: string | null
}

function statusColor(status: string | null) {
  switch (status) {
    case 'completed': return GREEN
    case 'error': return RED
    case 'processing': return BLUE
    case 'pending': return YELLOW
    case 'no_data': return MUTED
    default: return '#94a3b8' // unfilled — slate
  }
}

function statusLabel(status: string | null) {
  switch (status) {
    case 'completed': return 'Filled'
    case 'error': return 'Error'
    case 'processing': return 'Processing...'
    case 'pending': return 'Scheduled'
    case 'no_data': return 'No Data'
    default: return 'Not Run'
  }
}

function firmLabel(firm: string) {
  const map: Record<string, string> = {
    lhp: 'LHP', lhp_spanish: 'LHP-S', fears: 'Fears', jm: 'J&M',
    eisenberg: 'EBL', levine: 'Levine', thl: 'THL', mca: 'MCA',
  }
  return map[firm] ?? firm.toUpperCase()
}

function Countdown({ scheduledAt }: { scheduledAt: string }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    function update() {
      const diff = new Date(scheduledAt).getTime() - Date.now()
      if (diff <= 0) {
        setRemaining('Due now')
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (h > 0) setRemaining(`${h}h ${m}m ${s}s`)
      else if (m > 0) setRemaining(`${m}m ${s}s`)
      else setRemaining(`${s}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [scheduledAt])

  return (
    <span style={{
      fontSize: 12, fontWeight: 600, color: ACCENT,
      fontVariantNumeric: 'tabular-nums',
    }}>
      {remaining}
    </span>
  )
}

export default function SendCasePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [apiError, setApiError] = useState<string | null>(null)
  // Photos are loaded per contact on expand — fetching them for every lead on
  // every poll would spend GHL quota for rows nobody opened.
  const [photos, setPhotos] = useState<Record<string, PhotoState>>({})

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/sendcase')
      const data = await res.json()
      if (!res.ok || data.error) {
        // A GHL refusal used to arrive here as an empty list, which the UI
        // showed as "no leads" — indistinguishable from a real empty pipeline.
        const reset = data.resetInSeconds
          ? ` Resets in ~${Math.round(data.resetInSeconds / 3600)}h.`
          : ''
        setApiError(`${data.error ?? `Request failed (${res.status})`}${reset}`)
      } else {
        setApiError(data.warning ?? null)
        setLeads(data.leads ?? [])
      }
    } catch (err) {
      console.error('Failed to fetch leads', err)
      setApiError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Each poll costs ~1 GHL call per pending-send stage. At 30s a single tab
    // left open all day burned a meaningful slice of the 200k/day quota, so
    // poll less often and not at all while the tab is in the background.
    const tick = () => {
      if (document.visibilityState === 'visible') fetchLeads()
    }
    tick()
    const interval = setInterval(tick, 120000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [fetchLeads])

  const loadPhotos = useCallback(async (contactId: string) => {
    setPhotos(prev => (prev[contactId] ? prev : { ...prev, [contactId]: { loading: true } }))
    try {
      const res = await fetch(`/api/sendcase/images?contactId=${encodeURIComponent(contactId)}`)
      const d = await res.json()
      if (!res.ok || d.error) {
        setPhotos(prev => ({ ...prev, [contactId]: { loading: false, error: d.error ?? `Failed (${res.status})` } }))
      } else {
        setPhotos(prev => ({ ...prev, [contactId]: { loading: false, images: d.images ?? [] } }))
      }
    } catch (err) {
      setPhotos(prev => ({ ...prev, [contactId]: { loading: false, error: String(err) } }))
    }
  }, [])

  function toggleExpand(contactId: string) {
    const opening = expanded !== contactId
    setExpanded(opening ? contactId : null)
    if (opening && !photos[contactId]) void loadPhotos(contactId)
  }

  async function runFill(contactId: string) {
    setRunning(prev => new Set(prev).add(contactId))
    try {
      await fetch('/api/dialer/intake-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      })
      await fetchLeads()
    } catch (err) {
      console.error('Run failed', err)
    } finally {
      setRunning(prev => {
        const next = new Set(prev)
        next.delete(contactId)
        return next
      })
    }
  }

  const filled = leads.filter(l => l.fillStatus === 'completed').length
  const scheduled = leads.filter(l => l.fillStatus === 'pending' || l.fillStatus === 'processing').length
  const errors = leads.filter(l => l.fillStatus === 'error').length
  const notRun = leads.filter(l => !l.fillStatus).length

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '32px 24px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: DARK, marginBottom: 4 }}>
            Send Case — Intake Auto-Fill
          </h1>
          <p style={{ fontSize: 13, color: MUTED }}>
            All leads in the Pending Send pipeline. Fields auto-fill 1 hour after signing, or click Run to fill now.
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
          <StatCard label="Total in PS" value={leads.length} color={DARK} />
          <StatCard label="Not Run" value={notRun} color="#94a3b8" />
          <StatCard label="Scheduled" value={scheduled} color={YELLOW} />
          <StatCard label="Filled" value={filled} color={GREEN} />
          <StatCard label="Errors" value={errors} color={RED} />
        </div>

        {/* Error / warning banner */}
        {apiError && (
          <div style={{
            background: '#fff5f5', border: `1px solid ${RED}`, borderRadius: 10,
            padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991b1b',
          }}>
            <strong>Couldn't load from GHL:</strong> {apiError}
          </div>
        )}

        {/* Lead list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED }}>Loading leads from GHL...</div>
        ) : leads.length === 0 ? (
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: 48, textAlign: 'center', color: MUTED,
          }}>
            No leads in the Pending Send pipeline.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {leads.map(lead => {
              const isRunning = running.has(lead.contactId)
              const isExpanded = expanded === lead.contactId
              const canRun = !lead.fillStatus || lead.fillStatus === 'error' || lead.fillStatus === 'pending'
              const writtenCount = lead.fieldsWritten ? Object.keys(lead.fieldsWritten).length : 0

              return (
                <div key={lead.contactId} style={{
                  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
                  overflow: 'hidden',
                }}>
                  {/* Row header */}
                  <div
                    onClick={() => toggleExpand(lead.contactId)}
                    style={{
                      padding: '12px 16px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: 10,
                    }}
                  >
                    {/* Status dot */}
                    <div style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: statusColor(lead.fillStatus), flexShrink: 0,
                    }} />

                    {/* Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: DARK }}>
                        {lead.contactName || lead.contactId}
                      </span>
                    </div>

                    {/* Firm badge */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: ACCENT,
                      background: `${ACCENT}14`, padding: '2px 8px', borderRadius: 4,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {firmLabel(lead.firm)}
                    </span>

                    {/* Status badge */}
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: statusColor(lead.fillStatus),
                      background: `${statusColor(lead.fillStatus)}14`,
                      padding: '2px 10px', borderRadius: 12, minWidth: 70, textAlign: 'center',
                    }}>
                      {isRunning ? 'Running...' : statusLabel(lead.fillStatus)}
                    </span>

                    {/* Fields written count */}
                    {lead.fillStatus === 'completed' && writtenCount > 0 && (
                      <span style={{ fontSize: 12, color: GREEN, fontWeight: 600, minWidth: 55 }}>
                        {writtenCount} fields
                      </span>
                    )}

                    {/* Countdown or time */}
                    <div style={{ minWidth: 80, textAlign: 'right' }}>
                      {lead.fillStatus === 'pending' && lead.scheduledAt ? (
                        <Countdown scheduledAt={lead.scheduledAt} />
                      ) : lead.completedAt ? (
                        <span style={{ fontSize: 11, color: MUTED }}>
                          {timeAgo(lead.completedAt)}
                        </span>
                      ) : lead.createdAt ? (
                        <span style={{ fontSize: 11, color: MUTED }}>
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>

                    {/* Run button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); runFill(lead.contactId) }}
                      disabled={isRunning || !canRun}
                      style={{
                        fontSize: 11, fontWeight: 600, color: '#fff',
                        background: isRunning ? MUTED : canRun ? ACCENT : `${GREEN}90`,
                        border: 'none', borderRadius: 6,
                        padding: '5px 14px', cursor: canRun && !isRunning ? 'pointer' : 'default',
                        opacity: isRunning ? 0.6 : 1,
                        minWidth: 52,
                      }}
                    >
                      {isRunning ? '...' : canRun ? 'Run' : 'Done'}
                    </button>

                    {/* Expand arrow */}
                    <span style={{
                      fontSize: 12, color: MUTED,
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s', display: 'inline-block',
                    }}>
                      ▼
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${BORDER}` }}>
                      {/* Contact info */}
                      <div style={{ display: 'flex', gap: 24, margin: '10px 0', fontSize: 12, color: MUTED }}>
                        {lead.phone && <span>Phone: {lead.phone}</span>}
                        {lead.email && <span>Email: {lead.email}</span>}
                        {lead.pipelineStage && <span>Stage: {lead.pipelineStage}</span>}
                      </div>

                      {/* Photos the client texted in */}
                      {(() => {
                        const ps = photos[lead.contactId]
                        if (!ps) return null
                        if (ps.loading) {
                          return <p style={{ fontSize: 12, color: MUTED, margin: '10px 0' }}>Loading photos…</p>
                        }
                        if (ps.error) {
                          return (
                            <p style={{ fontSize: 12, color: RED, margin: '10px 0' }}>
                              Couldn&apos;t load photos: {ps.error}
                            </p>
                          )
                        }
                        const imgs = ps.images ?? []
                        if (imgs.length === 0) {
                          return <p style={{ fontSize: 12, color: MUTED, margin: '10px 0' }}>No photos on this contact.</p>
                        }
                        const zipUrl =
                          `/api/sendcase/images/download?contactId=${encodeURIComponent(lead.contactId)}` +
                          `&name=${encodeURIComponent(lead.contactName ?? lead.contactId)}`
                        return (
                          <div style={{ margin: '10px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <Label color={DARK}>Photos ({imgs.length})</Label>
                              <a
                                href={zipUrl}
                                style={{
                                  fontSize: 12, fontWeight: 700, textDecoration: 'none',
                                  background: ACCENT, color: '#fff',
                                  padding: '5px 11px', borderRadius: 6,
                                }}
                              >
                                Download all
                              </a>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {imgs.map(img => (
                                <a
                                  key={img.name}
                                  href={img.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`${img.name}${img.dateAdded ? ` · ${img.dateAdded.slice(0, 10)}` : ''}`}
                                  style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
                                >
                                  <img
                                    src={img.url}
                                    alt={img.name}
                                    loading="lazy"
                                    style={{
                                      width: 96, height: 96, objectFit: 'cover',
                                      borderRadius: 6, border: `1px solid ${BORDER}`,
                                      display: 'block', background: '#EFEAE0',
                                    }}
                                  />
                                  <span style={{ fontSize: 10, color: MUTED }}>{img.name}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Summary */}
                      {lead.summary && (
                        <div style={{ margin: '10px 0' }}>
                          <Label color={DARK}>Summary</Label>
                          <p style={{ fontSize: 13, color: DARK, marginTop: 4, lineHeight: 1.5 }}>{lead.summary}</p>
                        </div>
                      )}

                      {/* Flags */}
                      {lead.flags && lead.flags.length > 0 && (
                        <div style={{ margin: '10px 0' }}>
                          <Label color={RED}>Flags</Label>
                          <ul style={{ margin: '4px 0 0 16px', fontSize: 13, color: DARK }}>
                            {lead.flags.map((f, i) => <li key={i} style={{ marginBottom: 2 }}>{f}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Fields written */}
                      {lead.fieldsWritten && Object.keys(lead.fieldsWritten).length > 0 && (
                        <div style={{ margin: '10px 0' }}>
                          <Label color={GREEN}>Fields Written</Label>
                          <FieldTable fields={lead.fieldsWritten} color={DARK} />
                        </div>
                      )}

                      {/* Fields skipped */}
                      {lead.fieldsSkipped && Object.keys(lead.fieldsSkipped).length > 0 && (
                        <div style={{ margin: '10px 0' }}>
                          <Label color={MUTED}>Fields Skipped (already filled)</Label>
                          <FieldTable fields={lead.fieldsSkipped} color={MUTED} />
                        </div>
                      )}

                      {/* Error */}
                      {lead.error && (
                        <div style={{ margin: '10px 0', padding: '8px 12px', background: `${RED}0c`, borderRadius: 6 }}>
                          <Label color={RED}>Error</Label>
                          <p style={{ fontSize: 12, color: RED, marginTop: 4 }}>{lead.error}</p>
                        </div>
                      )}

                      {/* Not run yet message */}
                      {!lead.fillStatus && !lead.error && (
                        <div style={{ margin: '10px 0', padding: '12px', background: `${BORDER}40`, borderRadius: 6, fontSize: 13, color: MUTED }}>
                          Intake fill has not run yet for this lead. Click <strong>Run</strong> to fill now, or it will auto-run 1 hour after signing.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
    </div>
  )
}

function Label({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {children}
    </p>
  )
}

function FieldTable({ fields, color }: { fields: Record<string, string>; color: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      {Object.entries(fields).map(([label, value]) => (
        <div key={label} style={{
          display: 'flex', gap: 8, fontSize: 12, padding: '3px 0',
          borderBottom: `1px solid ${BORDER}20`,
        }}>
          <span style={{ fontWeight: 600, color: MUTED, minWidth: 200, flexShrink: 0 }}>{label}</span>
          <span style={{ color }}>{value}</span>
        </div>
      ))}
    </div>
  )
}
