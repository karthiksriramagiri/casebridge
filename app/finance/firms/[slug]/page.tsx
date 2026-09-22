'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { invoicePathSegment } from '@/app/finance/firms/_lib/invoice-routes'
import { MetricsHeader, Breadcrumbs } from '@/app/_metrics/chrome'
import {
  money, num, compact, pct, shortDate,
  cplBand, caseBand, bandClass,
  Overlay, EmptyState, Banner, DashboardSkeleton,
  IconPlus, IconClose, IconArrow, IconPencil, IconWarn,
} from '@/app/_metrics/dash'

type FirmInvoice = {
  id: string
  code: string
  title: string | null
  period_start: string
  period_end: string
  sort_order: number
}

type Breakdown = {
  invoiceCode: string
  signedCases: number
  originalCases: number
  replacementCases: number
  totalVictims: number
  grossRevenue: number
}

const BLANK = {
  code: '', title: '', period_start: '', period_end: '',
  payment_received: '', payment_interest_rate: '',
}

export default function FirmHome() {
  const params = useParams()
  const slug = params.slug as string

  const [firm, setFirm] = useState<any>(null)
  const [firmName, setFirmName] = useState('')
  const [invoices, setInvoices] = useState<FirmInvoice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [setupHint, setSetupHint] = useState<string | null>(null)

  const [meta, setMeta] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [breakdown, setBreakdown] = useState<Breakdown[]>([])
  const [loading, setLoading] = useState(true)

  const [dialog, setDialog] = useState<{ mode: 'add' } | { mode: 'edit'; invoice: FirmInvoice } | null>(null)

  function loadInvoices() {
    fetch(`/api/metrics/firm-invoices?firm=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => {
        setError(null); setSetupHint(null)
        if (d.error) { setError(d.error); return }
        setFirm(d.firm || null)
        setFirmName(d.firm?.name || slug)
        setInvoices(d.invoices || [])
        if (d.setupRequired && d.setupHint) setSetupHint(d.setupHint)
      })
      .catch(() => setError('This firm could not be loaded.'))
  }

  useEffect(() => { loadInvoices() }, [slug])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&date_preset=maximum`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          setMeta(d.meta || null)
          setSummary(d.summary || null)
          setBreakdown(d.invoiceBreakdown || [])
          // firm-invoices returns only name and slug; the KPI response carries
          // case value, spend caps and the replacement window.
          if (d.firm) setFirm((prev: any) => ({ ...(prev || {}), ...d.firm }))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  const byCode = useMemo(() => {
    const m: Record<string, Breakdown> = {}
    for (const b of breakdown) m[b.invoiceCode] = b
    return m
  }, [breakdown])

  /* Newest invoice first — the one being worked on is almost always the one
     you came here for. */
  const ordered = useMemo(() => {
    return [...invoices].sort((a, b) =>
      (b.period_start || '').localeCompare(a.period_start || '') || (b.sort_order ?? 0) - (a.sort_order ?? 0))
  }, [invoices])

  const totalCases = summary?.originalCases ?? 0
  const allTimeCpa = totalCases > 0 && meta?.spend ? meta.spend / totalCases : null
  const billed = breakdown.reduce((t, b) => t + (b.grossRevenue || 0), 0)

  return (
    <>
      <MetricsHeader />

      <div className="mx-idbar">
        <div className="mx-idbar-inner">
          <div style={{ minWidth: 0 }}>
            <Breadcrumbs items={[
              
              { label: firmName || slug },
            ]} />
            <h1 className="mx-idbar-title" style={{ marginTop: 5 }}>{firmName || slug.toUpperCase()}</h1>
          </div>
          <div className="mx-idbar-spacer">
            {firm?.case_value != null && (
              <span className="mx-idbar-meta">Case value <b style={{ color: 'var(--mx-ink)', fontWeight: 700 }}>{money(firm.case_value)}</b></span>
            )}
            {firm?.replacement_window_days != null && (
              <span className="mx-idbar-meta">{firm.replacement_window_days}-day replacement window</span>
            )}
            <span className={`mx-pill ${meta?.connected ? 't-scale' : 't-floor'}`}>
              <span className="mx-pill-dot" />
              {meta?.connected ? 'Meta connected' : 'No Meta account'}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-main" id="mx-main">
        {error && <div style={{ marginBottom: 16 }}><Banner tone="crit" title="Could not load this firm">{error}</Banner></div>}

        {setupHint && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="warn" title="Database setup needed">
              {setupHint}
              <div style={{ marginTop: 5 }}>
                Migration file: <code>supabase/migration_firm_invoice_periods.sql</code>
              </div>
            </Banner>
          </div>
        )}

        {loading ? <DashboardSkeleton /> : (
          <div style={{ display: 'grid', gap: 30 }}>

            {/* ── All-time ─────────────────────────────────────────────── */}
            <section>
              <div className="mx-section-head">
                <p className="mx-eyebrow">Since this firm started</p>
                <p className="mx-section-note">
                  {meta?.campaignFilter ? `Campaigns matching "${meta.campaignFilter}"` : 'All campaigns on the account'}
                </p>
              </div>

              {meta?.error ? (
                <Banner tone="crit" title="Meta returned an error">{meta.error}</Banner>
              ) : !meta ? (
                <Banner tone="warn" title="No Meta figures">
                  Meta data is unavailable. Check that META_ACCESS_TOKEN is set and the firm has a Meta account ID.
                </Banner>
              ) : (
                <>
                  <div className="mx-hero">
                    <div className="mx-hero-cell">
                      <span className="mx-hero-label">Ad spend</span>
                      <span className="mx-hero-value">{money(meta.spend)}</span>
                      <span className="mx-hero-foot">across {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}</span>
                    </div>
                    <div className="mx-hero-cell">
                      <span className="mx-hero-label">Cost per lead</span>
                      <span className={`mx-hero-value ${meta.cpl == null ? 'is-empty' : `is-${cplBand(meta.cpl)}`}`}>{money(meta.cpl)}</span>
                      <span className="mx-hero-foot">{num(meta.leads)} Meta leads</span>
                    </div>
                    <div className="mx-hero-cell">
                      <span className="mx-hero-label">Cost per signed case</span>
                      <span className={`mx-hero-value ${allTimeCpa == null ? 'is-empty' : `is-${caseBand(allTimeCpa)}`}`}>{money(allTimeCpa)}</span>
                      <span className="mx-hero-foot">{totalCases} original cases</span>
                    </div>
                    <div className="mx-hero-cell">
                      <span className="mx-hero-label">Gross billed</span>
                      <span className={`mx-hero-value ${billed > 0 ? 'is-good' : 'is-empty'}`}>{money(billed)}</span>
                      <span className="mx-hero-foot">at {money(firm?.case_value)} per case</span>
                    </div>
                    <div className="mx-hero-cell">
                      <span className="mx-hero-label">Signed cases</span>
                      <span className={`mx-hero-value ${summary?.signedCases ? '' : 'is-empty'}`}>{summary?.signedCases ?? 0}</span>
                      <span className="mx-hero-foot">
                        {summary?.replacementCases > 0
                          ? `${summary.replacementCases} of them replacements`
                          : 'no replacements issued'}
                      </span>
                    </div>
                  </div>

                  <div className="mx-strip">
                    <Cell label="Impressions" value={compact(meta.impressions)} />
                    <Cell label="Clicks" value={num(meta.clicks)} />
                    <Cell label="CTR" value={meta.ctrPct != null ? pct(meta.ctrPct) : '—'} />
                    <Cell label="Meta leads" value={num(meta.leads)} />
                    <Cell label="CPQ" value={money(summary?.cpq)} band={caseBand(summary?.cpq)} />
                    <Cell label="Adjusted CPA" value={money(summary?.adjustedCpa)} band={caseBand(summary?.adjustedCpa)} />
                  </div>
                </>
              )}
            </section>

            {/* ── Invoices ─────────────────────────────────────────────── */}
            <section>
              <div className="mx-section-head">
                <div>
                  <p className="mx-eyebrow">Billing periods</p>
                </div>
                <button className="mx-btn mx-btn-primary" onClick={() => setDialog({ mode: 'add' })}>
                  <IconPlus /> Add invoice
                </button>
              </div>

              {ordered.length === 0 ? (
                <div className="mx-card">
                  <EmptyState
                    title="No invoices yet"
                    text="An invoice is a billing window. Create one and every figure on this page — spend, cases, P&L — can be sliced to it."
                    action={<button className="mx-btn mx-btn-primary" onClick={() => setDialog({ mode: 'add' })}><IconPlus /> Add invoice</button>}
                  />
                </div>
              ) : (
                <div className="mx-inv-grid">
                  {ordered.map(inv => {
                    const b = byCode[inv.code]
                    return (
                      <div className="mx-inv-wrap" key={inv.id}>
                        <Link href={`/finance/firms/${slug}/invoice/${invoicePathSegment(inv.code)}`} className="mx-inv">
                          <span className="mx-inv-code">{inv.code}</span>
                          <span className="mx-inv-title">{inv.title || inv.code}</span>
                          <span className="mx-inv-dates">
                            {shortDate(inv.period_start)} – {shortDate(inv.period_end)}
                          </span>

                          <span className="mx-inv-figs">
                            <span>
                              <span className="mx-inv-fig-label">Signed</span>
                              <span className="mx-inv-fig-val">{b ? b.originalCases : '—'}</span>
                            </span>
                            <span>
                              <span className="mx-inv-fig-label">Gross</span>
                              <span className="mx-inv-fig-val">{b ? money(b.grossRevenue) : '—'}</span>
                            </span>
                            {b && b.replacementCases > 0 && (
                              <span>
                                <span className="mx-inv-fig-label">Replaced</span>
                                <span className="mx-inv-fig-val" style={{ color: 'var(--mx-warn)' }}>{b.replacementCases}</span>
                              </span>
                            )}
                          </span>

                          {b && b.totalVictims !== b.originalCases && (
                            <span style={{ fontSize: 11, color: 'var(--mx-muted)', marginTop: 7 }}>
                              {b.totalVictims} total {b.totalVictims === 1 ? 'victim' : 'victims'} across those cases
                            </span>
                          )}
                        </Link>

                        <button className="mx-icon-btn mx-inv-edit"
                          onClick={() => setDialog({ mode: 'edit', invoice: inv })}
                          title={`Edit ${inv.code}`} aria-label={`Edit ${inv.code}`}>
                          <IconPencil size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {dialog && (
        <InvoiceDialog
          mode={dialog.mode}
          invoice={dialog.mode === 'edit' ? dialog.invoice : null}
          slug={slug}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); loadInvoices() }}
        />
      )}
    </>
  )
}

function Cell({ label, value, band }: { label: string; value: string; band?: ReturnType<typeof caseBand> }) {
  return (
    <div className="mx-strip-cell">
      <div className="mx-strip-label">{label}</div>
      <div className={`mx-strip-value ${value === '—' ? 'is-empty' : ''} ${band ? bandClass(band) : ''}`}>{value}</div>
    </div>
  )
}

/* ── Add / edit invoice ─────────────────────────────────────────────────── */

function InvoiceDialog({ mode, invoice, slug, onClose, onSaved }: {
  mode: 'add' | 'edit'
  invoice: FirmInvoice | null
  slug: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(
    invoice
      ? {
          code: invoice.code,
          title: invoice.title || '',
          period_start: invoice.period_start,
          period_end: invoice.period_end,
          payment_received: '',
          payment_interest_rate: '',
        }
      : BLANK
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'add' && !form.code.trim()) { setError('An invoice code is required.'); return }
    if (!form.period_start || !form.period_end) { setError('Both period dates are required.'); return }
    if (form.period_end < form.period_start) { setError('The period ends before it starts.'); return }

    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/metrics/firm-invoices', {
        method: mode === 'add' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'add'
            ? { firm_slug: slug, ...form }
            : {
                id: invoice!.id,
                title: form.title,
                period_start: form.period_start,
                period_end: form.period_end,
                ...(form.payment_received ? { payment_received: form.payment_received } : {}),
                ...(form.payment_interest_rate ? { payment_interest_rate: form.payment_interest_rate } : {}),
              }
        ),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || 'The invoice could not be saved.'); return }
      onSaved()
    } catch {
      setError('Connection failed. Please try again.')
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose} variant="dialog" labelledBy="fi-title">
      <div className="mx-dialog-head">
        <h2 id="fi-title" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          {mode === 'add' ? 'Add invoice' : `Edit ${invoice?.code}`}
        </h2>
        <button className="mx-icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button>
      </div>

      <div className="mx-dialog-body">
        <form id="fi-form" onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
          {mode === 'add' && (
            <div className="mx-field">
              <label className="mx-label" htmlFor="fi-code">Code</label>
              <input id="fi-code" className="mx-input" value={form.code} onChange={set('code')}
                placeholder="INV-7" autoFocus />
              <span className="mx-hint">Used in the URL as inv-7.</span>
            </div>
          )}
          <div className="mx-field" style={mode === 'add' ? undefined : { gridColumn: '1 / -1' }}>
            <label className="mx-label" htmlFor="fi-title">Title</label>
            <input id="fi-title" className="mx-input" value={form.title} onChange={set('title')}
              placeholder={form.code || 'Invoice 7'} autoFocus={mode === 'edit'} />
          </div>
          <div className="mx-field">
            <label className="mx-label" htmlFor="fi-start">Period start</label>
            <input id="fi-start" className="mx-input" type="date" value={form.period_start}
              max={form.period_end || undefined} onChange={set('period_start')} />
          </div>
          <div className="mx-field">
            <label className="mx-label" htmlFor="fi-end">Period end</label>
            <input id="fi-end" className="mx-input" type="date" value={form.period_end}
              min={form.period_start || undefined} onChange={set('period_end')} />
          </div>

          <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
            <Banner>
              The payment is what the firm actually paid. Every margin on this invoice is computed from it,
              net of the fee rate — leave both blank to fall back to cases × case value.
            </Banner>
          </div>

          <div className="mx-field">
            <label className="mx-label" htmlFor="fi-recv">Payment received</label>
            <input id="fi-recv" className="mx-input" type="number" value={form.payment_received}
              onChange={set('payment_received')} placeholder="35000" />
          </div>
          <div className="mx-field">
            <label className="mx-label" htmlFor="fi-rate">Fee rate</label>
            <input id="fi-rate" className="mx-input" type="number" step="0.001" value={form.payment_interest_rate}
              onChange={set('payment_interest_rate')} placeholder="0.03" />
            <span className="mx-hint">As a decimal — 0.03 is a 3% fee.</span>
          </div>

          {error && <p className="mx-error" style={{ gridColumn: '1 / -1' }}><IconWarn size={13} /> {error}</p>}
        </form>
      </div>

      <div className="mx-dialog-foot" style={{ justifyContent: 'flex-end' }}>
        <button className="mx-btn mx-btn-quiet" type="button" onClick={onClose}>Cancel</button>
        <button className="mx-btn mx-btn-primary" type="submit" form="fi-form" disabled={saving}>
          {saving ? 'Saving…' : mode === 'add' ? 'Create invoice' : 'Save changes'}
        </button>
      </div>
    </Overlay>
  )
}
