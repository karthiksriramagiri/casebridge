'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative assignments — the board

   A Notion-style database for creative briefs: one card per brief, dragged
   across the production pipeline. Columns are the stages the team already
   works in, so this replaces the Notion board rather than sitting beside it.

   Ordering uses sparse integer positions (1000, 2000, …) so dropping a card
   between two neighbours rewrites one row, not the column.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Brief = {
  id: string
  title: string
  status: string
  ad_type: string | null
  language: string
  assignee_id: string | null
  assigneeName: string | null
  due_date: string | null
  must_launch: boolean
  brief: string | null
  benchmark_url: string | null
  benchmark_name: string | null
  benchmark_kind: string | null
  deliverable_url: string | null
  launched_ad_id: string | null
  position: number
  commentCount: number
}

type Rep = { id: string; name: string; creative_slug: string | null }

export const STATUSES = [
  { key: 'assigned',         label: 'Assigned',         tone: 'idle'   },
  { key: 'in_progress',      label: 'In progress',      tone: 'info'   },
  { key: 'feedback_process', label: 'Feedback Process', tone: 'warn'   },
  { key: 'feedback_done',    label: 'Feedback Done',    tone: 'idle'   },
  { key: 'ready_to_launch',  label: 'Ready To Launch',  tone: 'accent' },
  { key: 'ad_launched',      label: 'AD Launched',      tone: 'good'   },
  { key: 'winner',           label: '🏆 Winner',        tone: 'gold'   },
]

/* The ad families from the angle taxonomy on /creative/angles. Keeping the
   same six here means a brief can be traced to the angle codes it produced. */
export const AD_TYPES = ['BR', 'HYB', 'UGC', 'BNR', 'ANM', 'IMG']

const LANGUAGES = [
  { key: 'english', label: 'English' },
  { key: 'spanish', label: 'Spanish' },
]

function fmtDate(d: string | null) {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/* ── Board ──────────────────────────────────────────────────────────────── */

export function AssignmentsBoard() {
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [reps, setReps] = useState<Rep[]>([])
  const [language, setLanguage] = useState('english')
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [open, setOpen] = useState<Brief | null>(null)
  const [composing, setComposing] = useState<string | null>(null)   // status key
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ status: string; index: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/creative/briefs?language=${language}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setBriefs(d.briefs || [])
        setNeedsMigration(!!d.needsMigration)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [language])

  useEffect(() => {
    fetch('/api/creative/reps').then(r => r.json()).then(d => setReps(d.reps || [])).catch(() => {})
  }, [])

  const byStatus = useMemo(() => {
    const m: Record<string, Brief[]> = {}
    for (const s of STATUSES) m[s.key] = []
    for (const b of briefs) (m[b.status] ??= []).push(b)
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.position - b.position)
    return m
  }, [briefs])

  /* ── Mutations. Each one updates local state first so the board never
        stalls behind a round trip, then reconciles with the server. ─────── */

  async function patch(id: string, fields: Partial<Brief>) {
    setBriefs(prev => prev.map(b => (b.id === id ? { ...b, ...fields } as Brief : b)))
    setOpen(prev => (prev && prev.id === id ? { ...prev, ...fields } as Brief : prev))
    await fetch(`/api/creative/briefs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }).catch(() => {})
  }

  async function create(status: string, title: string) {
    const res = await fetch('/api/creative/briefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, status, language }),
    })
    const d = await res.json()
    if (d.brief) setBriefs(prev => [...prev, { ...d.brief, commentCount: 0, assigneeName: null }])
  }

  async function remove(id: string) {
    setBriefs(prev => prev.filter(b => b.id !== id))
    setOpen(null)
    await fetch(`/api/creative/briefs/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  /* Drop: compute a position midway between the cards either side of the gap,
     so only the dragged row is written. */
  function drop(status: string, index: number) {
    const id = dragId
    setDragId(null)
    setDropTarget(null)
    if (!id) return

    const column = (byStatus[status] || []).filter(b => b.id !== id)
    const before = column[index - 1]
    const after = column[index]
    const position =
      before && after ? (before.position + after.position) / 2
      : before ? before.position + 1000
      : after ? after.position - 1000
      : 1000

    patch(id, { status, position })
  }

  const total = briefs.length

  return (
    <>
      <div className="mx-section-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="mx-page-title">Creative <i>Briefs</i></h1>
          <p className="mx-page-sub">
            {loading ? 'Loading…' : `${total} ${total === 1 ? 'brief' : 'briefs'} on the ${language === 'spanish' ? 'Spanish' : 'English'} board.`}
          </p>
        </div>
        <div className="mx-seg" role="group" aria-label="Board language">
          {LANGUAGES.map(l => (
            <button key={l.key} className="mx-seg-btn" aria-pressed={language === l.key}
              onClick={() => setLanguage(l.key)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {needsMigration && (
        <div className="mx-card cb-notice">
          <strong>The briefs table does not exist yet.</strong>
          <span>Run <code>supabase/migration_creative_briefs.sql</code> in the Supabase SQL editor, then reload this page.</span>
        </div>
      )}

      <div className="cb-board">
        {STATUSES.map(s => {
          const column = byStatus[s.key] || []
          return (
            <section key={s.key} className={`cb-col is-${s.tone}`}
              onDragOver={e => { e.preventDefault(); if (dragId) setDropTarget({ status: s.key, index: column.length }) }}
              onDrop={e => { e.preventDefault(); drop(s.key, dropTarget?.status === s.key ? dropTarget.index : column.length) }}
            >
              <header className="cb-col-head">
                <span className="cb-col-dot" aria-hidden="true" />
                <span className="cb-col-name">{s.label}</span>
                <span className="cb-col-count">{column.length}</span>
              </header>

              <div className="cb-col-body">
                {column.map((b, i) => (
                  <div key={b.id}
                    onDragOver={e => {
                      e.preventDefault(); e.stopPropagation()
                      if (dragId) setDropTarget({ status: s.key, index: i })
                    }}>
                    {dropTarget?.status === s.key && dropTarget.index === i && dragId && (
                      <div className="cb-dropline" aria-hidden="true" />
                    )}
                    <BriefCard brief={b}
                      dragging={dragId === b.id}
                      onDragStart={() => setDragId(b.id)}
                      onDragEnd={() => { setDragId(null); setDropTarget(null) }}
                      onOpen={() => setOpen(b)} />
                  </div>
                ))}

                {dropTarget?.status === s.key && dropTarget.index >= column.length && dragId && (
                  <div className="cb-dropline" aria-hidden="true" />
                )}

                {composing === s.key
                  ? <Composer onCancel={() => setComposing(null)}
                      onSubmit={title => { create(s.key, title); setComposing(null) }} />
                  : <button className="cb-new" onClick={() => setComposing(s.key)}>
                      <span aria-hidden="true">+</span> New brief
                    </button>}
              </div>
            </section>
          )
        })}
      </div>

      {open && (
        <BriefPanel brief={open} reps={reps}
          onClose={() => setOpen(null)}
          onPatch={fields => patch(open.id, fields)}
          onDelete={() => remove(open.id)} />
      )}
    </>
  )
}

/* ── Card ───────────────────────────────────────────────────────────────── */

function BriefCard({ brief, dragging, onDragStart, onDragEnd, onOpen }: {
  brief: Brief
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onOpen: () => void
}) {
  const due = fmtDate(brief.due_date)
  return (
    <article
      className={`cb-card${dragging ? ' is-dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      tabIndex={0}
      role="button"
    >
      <p className="cb-card-title">{brief.title}</p>

      {(brief.ad_type || brief.assigneeName) && (
        <div className="cb-card-tags">
          {brief.ad_type && <span className="cb-type">{brief.ad_type}</span>}
          {brief.assigneeName && <span className="cb-who">{brief.assigneeName}</span>}
        </div>
      )}

      {due && <p className="cb-card-date">{due}</p>}

      {(brief.must_launch || brief.commentCount > 0 || brief.deliverable_url || brief.benchmark_url) && (
        <div className="cb-card-foot">
          {brief.must_launch && <span className="cb-must">MUST-LAUNCH</span>}
          {brief.benchmark_url && <span className="cb-has-link" title="Benchmark reference attached">🎬</span>}
          {brief.deliverable_url && <span className="cb-has-link" title="Deliverable attached">🔗</span>}
          {brief.commentCount > 0 && <span className="cb-comments">💬 {brief.commentCount}</span>}
        </div>
      )}
    </article>
  )
}

/* ── Inline composer ────────────────────────────────────────────────────── */

function Composer({ onSubmit, onCancel }: { onSubmit: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  function submit() {
    const t = value.trim()
    if (t) onSubmit(t)
    else onCancel()
  }

  return (
    <div className="cb-composer">
      <textarea ref={ref} className="cb-composer-input" rows={2}
        placeholder="Brief title — e.g. 0916 | B00076_IMG2 | LHP | IMG"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={submit}
      />
      <p className="cb-composer-hint">Enter to add · Esc to cancel</p>
    </div>
  )
}

/* ── Detail panel ───────────────────────────────────────────────────────── */

function BriefPanel({ brief, reps, onClose, onPatch, onDelete }: {
  brief: Brief
  reps: Rep[]
  onClose: () => void
  onPatch: (fields: Partial<Brief>) => void
  onDelete: () => void
}) {
  const [comments, setComments] = useState<any[]>([])
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    fetch(`/api/creative/briefs/comments?brief_id=${brief.id}`)
      .then(r => r.json()).then(d => setComments(d.comments || [])).catch(() => {})
  }, [brief.id])

  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function addComment() {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    const res = await fetch('/api/creative/briefs/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief_id: brief.id, body }),
    })
    const d = await res.json()
    if (d.comment) setComments(prev => [...prev, d.comment])
  }

  return (
    <div className="cb-scrim" onClick={onClose}>
      <aside className="cb-panel" onClick={e => e.stopPropagation()} role="dialog" aria-label="Brief detail">
        <header className="cb-panel-head">
          <input className="cb-panel-title" value={brief.title}
            onChange={e => onPatch({ title: e.target.value })} aria-label="Title" />
          <button className="mx-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="cb-panel-body">
          <div className="cb-props">
            <Prop label="Status">
              <select className="mx-input" value={brief.status}
                onChange={e => onPatch({ status: e.target.value })}>
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Prop>

            <Prop label="Owner">
              <select className="mx-input" value={brief.assignee_id ?? ''}
                onChange={e => {
                  const id = e.target.value || null
                  onPatch({
                    assignee_id: id,
                    assigneeName: reps.find(r => r.id === id)?.name ?? null,
                  })
                }}>
                <option value="">Unassigned</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Prop>

            <Prop label="Type">
              <select className="mx-input" value={brief.ad_type ?? ''}
                onChange={e => onPatch({ ad_type: e.target.value || null })}>
                <option value="">—</option>
                {AD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Prop>

            <Prop label="Due">
              <input type="date" className="mx-input" value={brief.due_date ?? ''}
                onChange={e => onPatch({ due_date: e.target.value || null })} />
            </Prop>

            <Prop label="Deliverable">
              <input className="mx-input" placeholder="Link to the cut"
                value={brief.deliverable_url ?? ''}
                onChange={e => onPatch({ deliverable_url: e.target.value || null })} />
            </Prop>

            <Prop label="Launched ad ID">
              <input className="mx-input" placeholder="Meta ad id once live"
                value={brief.launched_ad_id ?? ''}
                onChange={e => onPatch({ launched_ad_id: e.target.value || null })} />
            </Prop>

            <Prop label="Priority">
              <label className="cb-check">
                <input type="checkbox" checked={brief.must_launch}
                  onChange={e => onPatch({ must_launch: e.target.checked })} />
                <span>Must launch</span>
              </label>
            </Prop>
          </div>

          <BenchmarkDrop brief={brief} onPatch={onPatch} />

          <div className="cb-field">
            <label className="mx-label" htmlFor="cb-brief">The brief</label>
            <textarea id="cb-brief" className="mx-input cb-textarea" rows={7}
              placeholder="Structure, script, reference — what is being made and why."
              value={brief.brief ?? ''}
              onChange={e => onPatch({ brief: e.target.value })} />
          </div>

          <div className="cb-field">
            <p className="mx-label">Feedback</p>
            {comments.length === 0 && <p className="cb-none">No feedback yet.</p>}
            {comments.map(c => (
              <div key={c.id} className="cb-comment">
                <p className="cb-comment-meta">
                  {c.author_name || 'Admin'} · {new Date(c.created_at).toLocaleDateString()}
                </p>
                <p className="cb-comment-body">{c.body}</p>
              </div>
            ))}
            <div className="cb-comment-new">
              <textarea className="mx-input cb-textarea" rows={2} placeholder="Leave feedback…"
                value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment() }} />
              <button className="mx-btn mx-btn-accent" onClick={addComment} disabled={!draft.trim()}>
                Post
              </button>
            </div>
          </div>
        </div>

        <footer className="cb-panel-foot">
          {confirmDelete ? (
            <>
              <span className="cb-confirm">Delete this brief?</span>
              <button className="mx-btn mx-btn-quiet" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="mx-btn cb-danger" onClick={onDelete}>Delete</button>
            </>
          ) : (
            <button className="mx-btn mx-btn-quiet" onClick={() => setConfirmDelete(true)}>Delete brief</button>
          )}
        </footer>
      </aside>
    </div>
  )
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cb-prop">
      <span className="cb-prop-label">{label}</span>
      <div className="cb-prop-value">{children}</div>
    </div>
  )
}

/* ── Benchmark reference ────────────────────────────────────────────────────
   "Make it like this." Sits above the brief because it is the thing the brief
   describes — a rep opens the card, watches the reference, then reads the ask.

   Two ways in, because both happen: most references are a link to someone
   else's ad, but an edited cut has to be dragged in as a file.             */

function BenchmarkDrop({ brief, onPatch }: {
  brief: Brief
  onPatch: (fields: Partial<Brief>) => void
}) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isVideoFile = brief.benchmark_kind === 'upload'

  async function upload(file: File) {
    setError(null)
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('brief_id', brief.id)
      const res = await fetch('/api/creative/briefs/benchmark', { method: 'POST', body })
      const d = await res.json()
      if (d.error) setError(d.error)
      else onPatch({
        benchmark_url: d.benchmark_url,
        benchmark_name: d.benchmark_name,
        benchmark_kind: d.benchmark_kind,
      })
    } catch (e) {
      setError('Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) { upload(file); return }
    // Dragging a video from another browser tab gives a URL, not a file.
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url?.startsWith('http')) {
      onPatch({ benchmark_url: url, benchmark_name: url, benchmark_kind: 'link' })
    }
  }

  function saveLink() {
    const url = link.trim()
    if (!url) { setLinking(false); return }
    onPatch({ benchmark_url: url, benchmark_name: url, benchmark_kind: 'link' })
    setLink('')
    setLinking(false)
  }

  if (brief.benchmark_url) {
    return (
      <div className="cb-field">
        <p className="mx-label">Benchmark</p>
        <div className="cb-bench-have">
          {isVideoFile ? (
            <video className="cb-bench-video" src={brief.benchmark_url} controls preload="metadata" />
          ) : (
            <a className="cb-bench-link" href={brief.benchmark_url} target="_blank" rel="noopener noreferrer">
              {brief.benchmark_name || brief.benchmark_url}
            </a>
          )}
          <div className="cb-bench-foot">
            <span className="cb-bench-name">{brief.benchmark_name}</span>
            <button className="mx-btn mx-btn-ghost" onClick={() =>
              onPatch({ benchmark_url: null, benchmark_name: null, benchmark_kind: null })}>
              Remove
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cb-field">
      <p className="mx-label">Benchmark</p>
      <div
        className={`cb-bench-drop${over ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {busy ? (
          <p className="cb-bench-msg">Uploading…</p>
        ) : linking ? (
          <div className="cb-bench-linkrow">
            <input className="mx-input" autoFocus placeholder="Paste a link to the reference"
              value={link}
              onChange={e => setLink(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); saveLink() }
                if (e.key === 'Escape') { setLink(''); setLinking(false) }
              }} />
            <button className="mx-btn mx-btn-accent" onClick={saveLink} disabled={!link.trim()}>Add</button>
          </div>
        ) : (
          <>
            <p className="cb-bench-msg">Drop the benchmark video here</p>
            <p className="cb-bench-sub">
              <button className="cb-bench-a" onClick={() => inputRef.current?.click()}>choose a file</button>
              {' or '}
              <button className="cb-bench-a" onClick={() => setLinking(true)}>paste a link</button>
            </p>
          </>
        )}
        <input ref={inputRef} type="file" accept="video/*" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
      </div>
      {error && <p className="cb-bench-err">{error}</p>}
    </div>
  )
}
