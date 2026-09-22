'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MetricsHeader } from '@/app/_metrics/chrome'
import { EmptyState } from '@/app/_metrics/dash'
import { HOOK_LABEL, BEAT_LABEL, MVA_LABEL, TAXONOMY_VERSION } from '@/app/_metrics/ad-taxonomy'
import { sampleFrames, SamplerError } from './sampler'
import './competitors.css'

/* ═══════════════════════════════════════════════════════════════════════════
   Competitor analysis

   A batch of ads — theirs and ours — goes through one pipeline: transcribe,
   sample frames, classify against a fixed taxonomy, then compare. The output
   is a framework and a ranked set of suggestions for a human to act on.

   Nothing here touches a live campaign. It reads ads and writes a report.
   ═══════════════════════════════════════════════════════════════════════════ */

type Ad = {
  id: string
  source_type: 'competitor' | 'ours'
  brand_name: string | null
  label: string | null
  video_url: string | null
  ad_library_url: string | null
  run_days: number | null
  duration_seconds: number | null
  status: string
  error: string | null
  has_audio: boolean | null
  frames_count: number
  transcript: string | null
  scorecard: any
  taxonomy_version: string | null
  batch: string | null
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Not started',
  transcribing: 'Transcribing…',
  transcribed: 'Transcribed',
  analyzing: 'Classifying…',
  scored: 'Scored',
  failed: 'Failed',
}

export default function CompetitorsPage() {
  const [ads, setAds] = useState<Ad[]>([])
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [report, setReport] = useState<any>(null)
  const [reporting, setReporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [openAd, setOpenAd] = useState<Ad | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/creative/competitors/ads').then(r => r.json()).catch(() => ({}))
    setAds(d.ads || [])
    setNeedsMigration(!!d.needsMigration)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const theirs = useMemo(() => ads.filter(a => a.source_type === 'competitor'), [ads])
  const ours = useMemo(() => ads.filter(a => a.source_type === 'ours'), [ads])
  const scored = useMemo(() => ads.filter(a => a.status === 'scored'), [ads])

  function mark(id: string, label: string | null) {
    setBusy(prev => {
      const next = { ...prev }
      if (label) next[id] = label; else delete next[id]
      return next
    })
  }

  /* ── The pipeline, per ad ─────────────────────────────────────────────── */

  async function runPipeline(ad: Ad) {
    setNotice(null)
    try {
      mark(ad.id, 'Transcribing')
      const t = await fetch('/api/creative/competitors/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_id: ad.id }),
      }).then(r => r.json())
      if (t.error) throw new Error(t.error)

      // Frames are sampled here in the browser — see sampler.ts for why.
      if (ad.video_url) {
        mark(ad.id, 'Sampling frames')
        try {
          const { frames, times } = await sampleFrames(ad.video_url,
            (done, total) => mark(ad.id, `Sampling ${done}/${total}`))
          const fd = new FormData()
          fd.append('ad_id', ad.id)
          fd.append('times', times.join(','))
          frames.forEach((f, i) => fd.append('frames', f, `${i}.jpg`))
          const f = await fetch('/api/creative/competitors/frames', { method: 'POST', body: fd })
            .then(r => r.json())
          if (f.error) throw new Error(f.error)
        } catch (e) {
          // A frameless ad is still worth classifying from its transcript —
          // the scorer marks its own confidence low and says why.
          if (e instanceof SamplerError) {
            setNotice(`${ad.label || 'Ad'}: ${e.message} Classifying from the transcript alone.`)
          } else throw e
        }
      }

      mark(ad.id, 'Classifying')
      const s = await fetch('/api/creative/competitors/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_id: ad.id }),
      }).then(r => r.json())
      if (s.error) throw new Error(s.error)

      await load()
    } catch (e: any) {
      setNotice(`${ad.label || 'Ad'}: ${e?.message || 'Pipeline failed.'}`)
      await load()
    } finally {
      mark(ad.id, null)
    }
  }

  async function runAll() {
    for (const ad of ads.filter(a => a.status !== 'scored')) {
      await runPipeline(ad)
    }
  }

  async function generateReport() {
    setReporting(true)
    setNotice(null)
    const d = await fetch('/api/creative/competitors/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(r => r.json()).catch(e => ({ error: String(e) }))
    setReporting(false)
    if (d.error) { setNotice(d.error); return }
    setReport(d.report)
  }

  async function removeAd(id: string) {
    await fetch(`/api/creative/competitors/ads/${id}`, { method: 'DELETE' })
    setOpenAd(null)
    load()
  }

  return (
    <>
      <MetricsHeader onRefresh={load} />

      <main className="mx-main">
        <div className="mx-section-head" style={{ marginBottom: 14 }}>
          <div>
            <h1 className="mx-page-title">Competitor <i>analysis</i></h1>
            <p className="mx-page-sub">
              Tear down their ads and ours against one taxonomy, then read the gap.
              Analysis only — nothing here changes a campaign.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="mx-btn" onClick={() => setAdding(true)}>Add ads</button>
            {ads.some(a => a.status !== 'scored') && (
              <button className="mx-btn" onClick={runAll}>Run all</button>
            )}
            <button className="mx-btn mx-btn-accent" onClick={generateReport}
              disabled={reporting || scored.length < 2}
              title={scored.length < 2 ? 'Score at least two ads first' : undefined}>
              {reporting ? 'Analysing…' : 'Generate report'}
            </button>
          </div>
        </div>

        {needsMigration && (
          <div className="mx-card cx-notice">
            <strong>The competitor tables do not exist yet.</strong>
            <span>Run <code>supabase/migration_competitor_ads.sql</code> in the Supabase SQL editor, then reload.</span>
          </div>
        )}

        {notice && (
          <div className="mx-card cx-notice is-warn">
            <span>{notice}</span>
            <button className="mx-btn mx-btn-ghost" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}

        {loading ? null : ads.length === 0 ? (
          <div className="mx-card">
            <EmptyState
              title="No ads yet"
              text="Add competitor ads and a few of our own, then run the pipeline. Ad Library links are collected by hand — see the note in the add panel."
              action={<button className="mx-btn mx-btn-accent" onClick={() => setAdding(true)}>Add ads</button>}
            />
          </div>
        ) : (
          <>
            <div className="cx-cols">
              <AdColumn title="Competitors" ads={theirs} busy={busy} onRun={runPipeline} onOpen={setOpenAd} />
              <AdColumn title="Ours" ads={ours} busy={busy} onRun={runPipeline} onOpen={setOpenAd} />
            </div>
            <p className="cx-foot">
              Taxonomy <code>{TAXONOMY_VERSION}</code> · {scored.length} of {ads.length} scored.
              Run duration is a <strong>proxy</strong> for a creative working, not proof — the report labels it as inference.
            </p>
          </>
        )}

        {report && <Report report={report} onClose={() => setReport(null)} />}
      </main>

      {adding && <AddPanel onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load() }} />}
      {openAd && <AdPanel ad={openAd} onClose={() => setOpenAd(null)} onDelete={() => removeAd(openAd.id)} />}
    </>
  )
}

/* ── Columns ────────────────────────────────────────────────────────────── */

function AdColumn({ title, ads, busy, onRun, onOpen }: {
  title: string; ads: Ad[]; busy: Record<string, string>
  onRun: (a: Ad) => void; onOpen: (a: Ad) => void
}) {
  return (
    <section>
      <div className="mx-section-head" style={{ marginBottom: 8 }}>
        <p className="mx-eyebrow">{title}</p>
        <p className="mx-section-note">{ads.length}</p>
      </div>
      <div className="mx-card cx-list">
        {ads.length === 0 && <p className="cx-none">Nothing here yet.</p>}
        {ads.map(a => (
          <div key={a.id} className="cx-row" onClick={() => onOpen(a)}>
            <div className="cx-row-main">
              <p className="cx-row-title">
                {a.label || a.brand_name || 'Untitled ad'}
                {a.run_days != null && <span className="cx-run" title="Days running — inference, not proof">{a.run_days}d</span>}
              </p>
              <p className="cx-row-sub">
                {a.scorecard?.hook?.type
                  ? <><span className="cx-hook">{HOOK_LABEL[a.scorecard.hook.type]}</span>{a.scorecard.hook.verbatim_line_or_visual ? ` “${String(a.scorecard.hook.verbatim_line_or_visual).slice(0, 70)}”` : ''}</>
                  : a.error
                    ? <span className="cx-err">{a.error.slice(0, 90)}</span>
                    : STATUS_LABEL[a.status] || a.status}
              </p>
            </div>
            <div className="cx-row-side" onClick={e => e.stopPropagation()}>
              {busy[a.id]
                ? <span className="cx-busy">{busy[a.id]}…</span>
                : a.status === 'scored'
                  ? <span className={`cx-badge is-${a.scorecard?.confidence || 'high'}`}>{a.scorecard?.confidence || 'scored'}</span>
                  : <button className="mx-btn mx-btn-ghost" onClick={() => onRun(a)}>Run</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Add ads ────────────────────────────────────────────────────────────── */

function AddPanel({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [text, setText] = useState('')
  const [sourceType, setSourceType] = useState<'competitor' | 'ours'>('competitor')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null)
    /* One ad per line: URL, then optional comma-separated label and run-days.
       Pasting a list is how a batch actually arrives. */
    const rows = text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const [url, label, runDays] = line.split(',').map(s => s?.trim())
      const isLibrary = /facebook\.com\/ads\/library/i.test(url)
      return {
        source_type: sourceType,
        video_url: isLibrary ? null : url,
        ad_library_url: isLibrary ? url : null,
        label: label || null,
        run_days: runDays ? Number(runDays) : null,
      }
    })
    const d = await fetch('/api/creative/competitors/ads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ads: rows }),
    }).then(r => r.json())
    setSaving(false)
    if (d.error) { setError(d.error); return }
    onAdded()
  }

  return (
    <div className="cx-scrim" onClick={onClose}>
      <aside className="cx-panel" onClick={e => e.stopPropagation()}>
        <header className="cx-panel-head">
          <p className="cx-panel-title">Add ads</p>
          <button className="mx-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="cx-panel-body">
          <div className="mx-seg" style={{ marginBottom: 12 }}>
            <button className="mx-seg-btn" aria-pressed={sourceType === 'competitor'}
              onClick={() => setSourceType('competitor')}>Competitor</button>
            <button className="mx-seg-btn" aria-pressed={sourceType === 'ours'}
              onClick={() => setSourceType('ours')}>Ours</button>
          </div>

          <label className="mx-label" htmlFor="cx-manifest">One ad per line</label>
          <textarea id="cx-manifest" className="mx-input cx-textarea" rows={9}
            placeholder={'https://video.cdn/ad.mp4, Rear-end hook, 42\nhttps://www.facebook.com/ads/library/?id=…'}
            value={text} onChange={e => setText(e.target.value)} />
          <p className="cx-hint">
            <code>url, label, days-running</code> — label and days optional.
          </p>

          <div className="cx-explain">
            <p><strong>Getting the video URL.</strong> The Meta Ad Library has no bulk video download,
            and scraping it at volume breaks Meta&apos;s terms and gets the account blocked. Open the ad in
            the Ad Library, and either copy the direct video URL from the network tab or download the
            file and host it.</p>
            <p><strong>Meta CDN links expire</strong> and are served without CORS headers, so frames
            cannot be read from them in the browser. If frame sampling fails, that is why — download
            the file and upload it instead. The ad is still classified from its transcript, at lower
            confidence.</p>
          </div>

          {error && <p className="cx-err">{error}</p>}
        </div>
        <footer className="cx-panel-foot">
          <button className="mx-btn mx-btn-quiet" onClick={onClose}>Cancel</button>
          <button className="mx-btn mx-btn-accent" onClick={save} disabled={saving || !text.trim()}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </footer>
      </aside>
    </div>
  )
}

/* ── Per-ad scorecard ───────────────────────────────────────────────────── */

function AdPanel({ ad, onClose, onDelete }: { ad: Ad; onClose: () => void; onDelete: () => void }) {
  const c = ad.scorecard
  return (
    <div className="cx-scrim" onClick={onClose}>
      <aside className="cx-panel is-wide" onClick={e => e.stopPropagation()}>
        <header className="cx-panel-head">
          <div>
            <p className="cx-panel-title">{ad.label || ad.brand_name || 'Untitled ad'}</p>
            <p className="cx-panel-sub">
              {ad.source_type === 'ours' ? 'Ours' : 'Competitor'}
              {ad.duration_seconds ? ` · ${Math.round(ad.duration_seconds)}s` : ''}
              {ad.frames_count ? ` · ${ad.frames_count} frames` : ' · no frames'}
              {ad.has_audio === false ? ' · no speech' : ''}
            </p>
          </div>
          <button className="mx-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="cx-panel-body">
          {!c ? (
            <p className="cx-none">{ad.error || 'Not scored yet.'}</p>
          ) : (
            <>
              <div className="cx-block">
                <p className="mx-eyebrow">Hook · {HOOK_LABEL[c.hook?.type] || c.hook?.type}</p>
                <p className="cx-quote">“{c.hook?.verbatim_line_or_visual}”</p>
                <p className="cx-meta">{c.hook?.timestamp_range} · {c.hook?.why}</p>
              </div>

              <div className="cx-block">
                <p className="mx-eyebrow">Structure</p>
                <div className="cx-beats">
                  {(c.structure_beats_present || []).map((b: any, i: number) => (
                    <div key={i} className="cx-beat">
                      <span className="cx-beat-t">{b.timestamp}</span>
                      <span className="cx-beat-n">{BEAT_LABEL[b.beat] || b.beat}</span>
                      <span className="cx-beat-s">{b.content_summary}</span>
                    </div>
                  ))}
                </div>
                {(c.structure_beats_missing || []).length > 0 && (
                  <p className="cx-missing">
                    Absent: {(c.structure_beats_missing || []).map((b: string) => BEAT_LABEL[b] || b).join(' · ')}
                  </p>
                )}
              </div>

              {(c.mva_elements || []).length > 0 && (
                <div className="cx-block">
                  <p className="mx-eyebrow">Vertical elements</p>
                  <div className="cx-tags">
                    {(c.mva_elements || []).map((m: string) => (
                      <span key={m} className="cx-tag">{MVA_LABEL[m] || m}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="cx-block">
                <p className="mx-eyebrow">Pacing</p>
                <p className="cx-meta">
                  {c.pacing?.cut_frequency} cuts · ~{c.pacing?.avg_shot_length_seconds}s per shot ·
                  {' '}{c.pacing?.visual_style} · {c.pacing?.shot_dominance?.replace('_', ' ')} ·
                  {' '}{c.pacing?.text_density} on-screen text
                  {c.hook_to_first_cta_seconds != null && ` · first CTA at ${c.hook_to_first_cta_seconds}s`}
                </p>
              </div>

              {c.notable_observations && (
                <div className="cx-block">
                  <p className="mx-eyebrow">Notes</p>
                  <p className="cx-meta">{c.notable_observations}</p>
                </div>
              )}

              {ad.transcript && (
                <details className="cx-block">
                  <summary className="cx-summary">Transcript</summary>
                  <p className="cx-transcript">{ad.transcript}</p>
                </details>
              )}
            </>
          )}
        </div>

        <footer className="cx-panel-foot">
          {ad.ad_library_url && (
            <a className="mx-btn mx-btn-quiet" href={ad.ad_library_url} target="_blank" rel="noopener noreferrer">
              Ad Library
            </a>
          )}
          <button className="mx-btn mx-btn-quiet" onClick={onDelete}>Delete</button>
        </footer>
      </aside>
    </div>
  )
}

/* ── Report ─────────────────────────────────────────────────────────────── */

function Report({ report, onClose }: { report: any; onClose: () => void }) {
  const t = report.tables
  return (
    <section className="cx-report">
      <div className="mx-section-head">
        <p className="mx-eyebrow">Creative intelligence report</p>
        <button className="mx-btn mx-btn-ghost" onClick={onClose}>Hide</button>
      </div>

      <div className="mx-card cx-report-body">
        <p className="cx-summary-text">{report.summary}</p>

        <div className="cx-tables">
          <FreqTable title={`Competitor hooks (${t.competitors.count})`} rows={t.competitors.hooks} />
          <FreqTable title={`Our hooks (${t.ours.count})`} rows={t.ours.hooks} />
          <FreqTable title="Competitor beats" rows={t.competitors.beats} />
          <FreqTable title="Our beats" rows={t.ours.beats} />
        </div>

        {t.longestRunning?.length > 0 && (
          <div className="cx-block">
            <p className="mx-eyebrow">Longest running — inferred winners</p>
            {t.longestRunning.map((a: any, i: number) => (
              <p key={i} className="cx-meta">
                <strong>{a.runDays}d</strong> · {a.label || a.brand} · {a.hook}
                {a.hookLine ? ` — “${String(a.hookLine).slice(0, 80)}”` : ''}
              </p>
            ))}
          </div>
        )}

        <div className="cx-block">
          <p className="mx-eyebrow">Gap analysis</p>
          {(report.gap_findings || []).map((g: any, i: number) => (
            <div key={i} className={`cx-gap is-${g.kind}`}>
              <p className="cx-gap-what">{g.finding}
                {g.verdict && <span className={`cx-verdict is-${g.verdict}`}>{g.verdict.replace('_', ' ')}</span>}
              </p>
              <p className="cx-gap-ev">{g.evidence}</p>
            </div>
          ))}
        </div>

        {(report.frameworks || []).map((f: any, i: number) => (
          <div key={i} className="cx-block cx-framework">
            <p className="mx-eyebrow">Framework · {f.name}</p>
            <p className="cx-meta">{f.rationale}</p>
            <div className="cx-beats">
              {(f.beats || []).map((b: any, j: number) => (
                <div key={j} className="cx-beat">
                  <span className="cx-beat-t">{b.timing}</span>
                  <span className="cx-beat-n">{BEAT_LABEL[b.beat] || b.beat}</span>
                  <span className="cx-beat-s">{b.direction}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="cx-block">
          <p className="mx-eyebrow">Suggestions — for review, not auto-applied</p>
          {(report.suggestions || []).map((s: any, i: number) => (
            <div key={i} className="cx-sugg">
              <p className="cx-sugg-what">
                <span className="cx-n">{i + 1}</span>{s.what}
                <span className={`cx-effort is-${s.effort}`}>{s.effort.replace('_', ' ')}</span>
                <span className={`cx-basis is-${s.basis}`}>{s.basis}</span>
              </p>
              <p className="cx-gap-ev">{s.why}</p>
              <p className="cx-watch">Watch: {s.watch}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FreqTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="cx-freq">
      <p className="cx-freq-title">{title}</p>
      {rows.length === 0 && <p className="cx-none">—</p>}
      {rows.map(r => (
        <div key={r.key} className="cx-freq-row">
          <span className="cx-freq-bar" style={{ width: `${r.pct}%` }} aria-hidden="true" />
          <span className="cx-freq-label">{r.label}</span>
          <span className="cx-freq-n">{r.n} · {r.pct}%</span>
        </div>
      ))}
    </div>
  )
}
