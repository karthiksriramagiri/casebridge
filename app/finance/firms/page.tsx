'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { money, Overlay, EmptyState, DashboardSkeleton, IconPlus, IconClose, IconArrow, IconWarn } from '@/app/_metrics/dash'
import { MetricsHeader } from '@/app/_metrics/chrome'

/* ═══════════════════════════════════════════════════════════════════════════
   Financial Center — Firms

   Every client firm on one page. Each opens onto its invoice periods, where
   the P&L, payroll and PC breakdowns live. The company-wide rollup across all
   of them is the front page, /finance.
   ═══════════════════════════════════════════════════════════════════════════ */

const BLANK_FIRM = {
  name: '', slug: '', case_value: '', meta_account_id: 'act_788484706914452',
  phase_initial: '5600', phase_scale: '11200', replacement_window_days: '14', sanguine_rate: '250',
}

const FIRM_FIELDS = [
  { label: 'Slug', key: 'slug', placeholder: 'mca', hint: 'Used in the firm URL', required: true },
  { label: 'Case value', key: 'case_value', placeholder: '2000', type: 'number', prefix: '$' },
  { label: 'Meta account ID', key: 'meta_account_id', placeholder: 'act_788484706914452' },
  { label: 'Initial phase cap', key: 'phase_initial', type: 'number', hint: 'Max spend per week while testing' },
  { label: 'Scale phase cap', key: 'phase_scale', type: 'number', hint: 'Max spend per week once scaling' },
  { label: 'Replacement window', key: 'replacement_window_days', type: 'number', hint: 'Days' },
  { label: 'Sanguine rate', key: 'sanguine_rate', type: 'number', hint: 'Per closed case' },
]

export default function FirmsPage() {
  const [firms, setFirms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [showAddFirm, setShowAddFirm] = useState(false)

  useEffect(() => {
    let c = false
    fetch('/api/metrics/firms')
      .then(r => r.json())
      .then(d => { if (!c) { setFirms(d.firms || []); setLoading(false); setRefreshing(false) } })
      .catch(() => { if (!c) { setLoading(false); setRefreshing(false) } })
    return () => { c = true }
  }, [nonce])

  function refresh() { setRefreshing(true); setNonce(n => n + 1) }

  return (
    <>

      <MetricsHeader refreshing={refreshing} onRefresh={refresh} />

      <main className="mx-main" id="mx-main">
        {loading
          ? <DashboardSkeleton />
          : <FirmsTab firms={firms} onAdd={() => setShowAddFirm(true)} />}
      </main>

      {showAddFirm && (
        <AddFirmDialog
          onCreated={firm => { setFirms(prev => [...prev, firm]); setShowAddFirm(false) }}
          onClose={() => setShowAddFirm(false)}
        />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Firms
   ═══════════════════════════════════════════════════════════════════════════ */

function FirmsTab({ firms, onAdd }: { firms: any[]; onAdd: () => void }) {
  return (
    <>
      <div className="mx-section-head" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="mx-page-title">Client <i>firms</i></h1>
          <p className="mx-page-sub">Each firm carries its own case value, Meta account and spend caps. Open one for its invoices and delivery.</p>
        </div>
        <button className="mx-btn mx-btn-primary" onClick={onAdd}><IconPlus /> Add firm</button>
      </div>

      {firms.length === 0 ? (
        <div className="mx-card">
          <EmptyState title="No firms configured" text="Add a client firm to start attributing spend, cases and invoices to it."
            action={<button className="mx-btn mx-btn-primary" onClick={onAdd}><IconPlus /> Add firm</button>} />
        </div>
      ) : (
        <div className="mx-firm-grid">
          {firms.map(firm => (
            <Link key={firm.id} href={`/finance/firms/${firm.slug}`} className="mx-firm">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mx-firm-name">{firm.name}</span>
                <IconArrow className="mx-firm-arrow" />
              </div>
              <div className="mx-firm-meta">
                <div>
                  <div className="mx-strip-label">Case value</div>
                  <div className="mx-strip-value">
                    {firm.case_value ? money(Number(firm.case_value)) : <span className="mx-dim">not set</span>}
                  </div>
                </div>
                <div>
                  <div className="mx-strip-label">Meta account</div>
                  <div className="mx-strip-value" style={{ fontSize: 13 }}>
                    {firm.meta_account_id
                      ? <span style={{ color: 'var(--mx-good)' }}>Connected</span>
                      : <span className="mx-dim">Not linked</span>}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function AddFirmDialog({ onCreated, onClose }: { onCreated: (firm: any) => void; onClose: () => void }) {
  const [form, setForm] = useState(BLANK_FIRM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.slug.trim()) { setError('A name and a slug are both required.'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/metrics/firms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, slug: form.slug, case_value: form.case_value,
          meta_account_id: form.meta_account_id,
          phase_initial_max_weekly_spend: form.phase_initial,
          phase_scale_max_weekly_spend: form.phase_scale,
          replacement_window_days: form.replacement_window_days,
          sanguine_rate_per_closed_case: form.sanguine_rate,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onCreated(data.firm)
    } catch {
      setError('Connection failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose} variant="dialog" labelledBy="firm-title">
      <div className="mx-dialog-head">
        <h2 id="firm-title" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Add firm</h2>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      <div className="mx-dialog-body">
        <form onSubmit={submit} id="firm-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
          <div className="mx-field" style={{ gridColumn: '1 / -1' }}>
            <label className="mx-label" htmlFor="f-name">Firm name</label>
            <input id="f-name" className="mx-input" value={form.name} autoFocus required
              placeholder="Georgia MCA"
              onChange={e => setForm(f => ({
                ...f,
                name: e.target.value,
                slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
              }))} />
          </div>

          {FIRM_FIELDS.map(f => (
            <div className="mx-field" key={f.key}>
              <label className="mx-label" htmlFor={`f-${f.key}`}>{f.label}</label>
              <input id={`f-${f.key}`} className="mx-input" type={(f as any).type || 'text'}
                value={(form as any)[f.key]} placeholder={(f as any).placeholder}
                onChange={e => setForm(ff => ({ ...ff, [f.key]: e.target.value }))} />
              {(f as any).hint && <span className="mx-hint">{(f as any).hint}</span>}
            </div>
          ))}

          {error && <p className="mx-error" style={{ gridColumn: '1 / -1' }}><IconWarn size={13} /> {error}</p>}
        </form>
      </div>

      <div className="mx-dialog-foot" style={{ justifyContent: 'flex-end' }}>
        <button className="mx-btn mx-btn-quiet" onClick={onClose} type="button">Cancel</button>
        <button className="mx-btn mx-btn-primary" form="firm-form" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Create firm'}
        </button>
      </div>
    </Overlay>
  )
}
