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

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

type OOSCase = {
  id: string
  name: string
  state: string | null
  cost_per_case: number
  replacement_days: number | null
  created_at: string
}

const BLANK_FORM = { name: '', state: '', cost_per_case: '', replacement_days: '' }

const fmt$ = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function OOSCasesPage() {
  const router = useRouter()
  const [cases,       setCases]       = useState<OOSCase[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState(BLANK_FORM)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/metrics/oos-cases')
      .then(r => r.json())
      .then(d => { setCases(d.cases || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const res = await fetch('/api/metrics/oos-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:             form.name,
        state:            form.state || null,
        cost_per_case:    Number(form.cost_per_case),
        replacement_days: form.replacement_days ? Number(form.replacement_days) : null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed to save'); return }
    setCases(prev => [data.case, ...prev])
    setForm(BLANK_FORM)
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this case?')) return
    setDeletingId(id)
    await fetch(`/api/metrics/oos-cases?id=${id}`, { method: 'DELETE' })
    setCases(prev => prev.filter(c => c.id !== id))
    setDeletingId(null)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login')
  }

  const totalCases = cases.length
  const totalSpend = cases.reduce((s, c) => s + (c.cost_per_case || 0), 0)
  const stateBreakdown: Record<string, number> = {}
  for (const c of cases) {
    const st = c.state || 'Unknown'
    stateBreakdown[st] = (stateBreakdown[st] || 0) + 1
  }
  const topStates = Object.entries(stateBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div style={{ minHeight: '100vh', background: BG, color: DARK }}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '0 24px', display: 'flex', alignItems: 'stretch', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingRight: 28, marginRight: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: DARK }}>CaseBridge</span>
            <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, fontSize: 16, color: ACCENT, marginLeft: 5 }}>Metrics</span>
          </div>
          {[
            { label: 'Overview',   href: '/metrics?tab=overview'  },
            { label: 'Marketing',  href: '/metrics?tab=marketing' },
            { label: 'HR',         href: '/metrics?tab=hr'        },
            { label: 'Firms',      href: '/metrics?tab=firms'     },
            { label: 'Angles',     href: '/metrics/angles'        },
            { label: 'OOS Cases',  href: '/metrics/oos-cases'     },
          ].map(({ label, href }) => (
            <Link key={label} href={href}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '14px 16px', fontSize: 13,
                fontWeight: label === 'OOS Cases' ? 700 : 500,
                color: label === 'OOS Cases' ? DARK : MUTED,
                borderBottom: label === 'OOS Cases' ? `2px solid ${DARK}` : '2px solid transparent',
                textDecoration: 'none',
              }}>
              {label}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: MUTED }}>Logout</button>
        </div>
      </div>

      <div style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, margin: 0 }}>
              Out of State{' '}
              <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 400, color: ACCENT }}>Cases</span>
            </h1>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>
              Cases sold to external buyers — manually tracked, no ad spend.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(true); setError(null) }}
            style={{ background: DARK, color: '#FFF', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Add Case
          </button>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 6 }}>Total Cases</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: DARK }}>{totalCases}</p>
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 6 }}>Total Value</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: DARK }}>{fmt$(totalSpend)}</p>
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 6 }}>Avg Per Case</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: DARK }}>{totalCases > 0 ? fmt$(totalSpend / totalCases) : '—'}</p>
          </div>
          {topStates.length > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: 8 }}>Top States</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {topStates.map(([st, n]) => (
                  <span key={st} style={{ fontSize: 12, fontWeight: 600, background: '#F5F0E8', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '2px 8px', color: DARK }}>
                    {st} <span style={{ color: MUTED, fontWeight: 400 }}>({n})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Cases table ───────────────────────────────────────────────────── */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <p style={{ padding: '40px 24px', textAlign: 'center', color: MUTED, fontSize: 14 }}>Loading cases…</p>
          ) : cases.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <p style={{ color: MUTED, fontSize: 14, marginBottom: 12 }}>No cases added yet.</p>
              <button onClick={() => setShowForm(true)} style={{ background: DARK, color: '#FFF', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Add First Case
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F5F1EB' }}>
                  {['Name', 'State', 'Cost', 'Replacement', 'Date Added', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: i >= 2 ? 'right' : 'left', padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < cases.length - 1 ? `1px solid ${BORDER}` : 'none', background: i % 2 === 0 ? CARD : '#FAFAF8' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: DARK }}>{c.name}</td>
                    <td style={{ padding: '12px 16px', color: MUTED }}>
                      {c.state ? (
                        <span style={{ background: '#F5F0E8', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600, color: DARK }}>
                          {c.state}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#15803D' }}>{fmt$(c.cost_per_case)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: MUTED }}>
                      {c.replacement_days != null ? `${c.replacement_days}d` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', fontSize: 12, opacity: deletingId === c.id ? 0.5 : 1 }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: DARK }}>
                  <td colSpan={2} style={{ padding: '10px 16px', color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>
                    {totalCases} case{totalCases !== 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#FFF', fontWeight: 700, fontSize: 14 }}>{fmt$(totalSpend)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* ── Add Case modal ─────────────────────────────────────────────────── */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowForm(false)}>
          <div
            style={{ background: CARD, borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: DARK }}>Add Out of State Case</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Manually record a case sold to an external buyer</div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: MUTED, lineHeight: 1 }}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, marginBottom: 6 }}>
                    Client Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="John Smith"
                    required
                    style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: DARK, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, marginBottom: 6 }}>
                    State
                  </label>
                  <select
                    value={form.state}
                    onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                    style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: form.state ? DARK : MUTED, outline: 'none', background: CARD, boxSizing: 'border-box' }}>
                    <option value=''>— Select state —</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, marginBottom: 6 }}>
                      Cost Per Case ($) *
                    </label>
                    <input
                      type='number'
                      min='0'
                      step='1'
                      value={form.cost_per_case}
                      onChange={e => setForm(f => ({ ...f, cost_per_case: e.target.value }))}
                      placeholder='0'
                      required
                      style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: DARK, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUTED, marginBottom: 6 }}>
                      Replacement (days)
                    </label>
                    <input
                      type='number'
                      min='0'
                      step='1'
                      value={form.replacement_days}
                      onChange={e => setForm(f => ({ ...f, replacement_days: e.target.value }))}
                      placeholder='e.g. 30'
                      style={{ width: '100%', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: DARK, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {error && (
                  <p style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px', margin: 0 }}>{error}</p>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button type='button' onClick={() => setShowForm(false)}
                    style={{ flex: 1, background: '#F5F0E8', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 0', fontSize: 13, color: MUTED, cursor: 'pointer', fontWeight: 500 }}>
                    Cancel
                  </button>
                  <button type='submit' disabled={saving}
                    style={{ flex: 2, background: saving ? '#6B7280' : DARK, border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, color: '#FFF', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                    {saving ? 'Saving…' : 'Add Case'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
