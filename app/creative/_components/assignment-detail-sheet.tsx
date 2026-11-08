'use client'

import { useEffect, useRef, useState } from 'react'
import { RequestPicker } from './admin/request-picker'
import {
  Boxes, Building2, CalendarDays, Clapperboard, Eye, FileText, FileType, Hash, Layers,
  Loader2, Maximize2, MessageSquare, Minimize2, Paperclip, ScrollText, Signal, Sparkles, Star, Type,
} from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/app/creative/_ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { Pill } from '@/app/creative/_components/admin/shared'
import { PriorityStars, PRIORITY_LABELS } from './admin/priority-stars'
import { PropertyRow, Empty } from './admin/property-row'
import { VersionStages } from './admin/version-stages'
import { TODAY } from '@/app/creative/_lib/data'
import { withAdsetDate, withCreativeDate } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import {
  ASSIGNMENT_FIRMS, ASSIGNMENT_STATUSES, CREATIVE_FORMATS, CREATIVE_TYPES, RELAUNCH_TYPE, ROLE_LABEL,
  parseRequests,
  type AssignmentFirm, type AssignmentStatus, type AssignmentType, type CreativeFormat,
} from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Opening a card.

   Laid out as a property list rather than a header full of chips. A chip row
   can only ever be read — it has no room for a label, so "LHP" and "B000123"
   and "A2 × B3" sit side by side with nothing saying which is the firm, the
   batch or the hooks, and none of them can be changed without going back to
   wherever they were first typed.

   As admin every property here is the control, so this is also where a brief
   gets corrected: the card reopens straight into editing. Faisal sees the
   same list read-only, keeps his own status moves, and keeps files and
   comments.
   ═══════════════════════════════════════════════════════════════════════════ */

const NONE = '__none'
const byNumber = (a: string, b: string) => (parseInt(a.slice(1), 10) || 0) - (parseInt(b.slice(1), 10) || 0)

export function AssignmentDetailSheet({ assignmentId, onClose }: { assignmentId: string | null; onClose: () => void }) {
  const role = useRole()
  const isAdmin = role === 'admin'
  const { assignments, getCreative, addComment, addAttachments, updateAssignment } = useStore()
  const a = assignments.find((x) => x.id === assignmentId)

  const [hooks, setHooks] = useState<{ visual: Record<string, string>; verbal: Record<string, string> }>({ visual: {}, verbal: {} })
  const [benchUploading, setBenchUploading] = useState(false)
  /* A brief with a script, several versions and their notes outgrows a side
     panel. Fullscreen is the same sheet at full width, so nothing has to be
     laid out twice — the property column just stops being the whole screen. */
  const [full, setFull] = useState(false)
  const benchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!a) return
    let live = true
    fetch('/api/creative/hooks')
      .then((r) => r.json())
      .then((d) => live && setHooks({ visual: d.visual ?? {}, verbal: d.verbal ?? {} }))
      .catch(() => {})
    return () => { live = false }
  }, [a?.id])

  /* Nothing selected: render no sheet at all rather than an empty one. An
     unnamed DialogContent is an accessibility error even when it is closed. */
  if (!a) return null

  const set = (patch: Parameters<typeof updateAssignment>[1]) => updateAssignment(a.id, patch)
  const fmt = CREATIVE_FORMATS.find((f) => f.code === a.format)
  const src = getCreative(a.sourceCreativeId)
  /* A relaunch keeps the ad set and the cut it already had, dated today —
     the date segment says when something went live, and a relaunch is
     going live now. Relaunches made before the names were stored carry
     neither, so they are derived the same way here rather than reading
     blank. */
  const adsetName = a.adsetName?.trim()
    || (a.type === RELAUNCH_TYPE && src ? withAdsetDate(src.adset, a.launchDate || TODAY) : undefined)
  const creativeName = a.creativeName?.trim()
    || (a.type === RELAUNCH_TYPE && src ? withCreativeDate(src.convention, a.launchDate || TODAY) : undefined)

  const visualOptions = Object.keys(hooks.visual).filter((c) => !fmt || c.startsWith(fmt.visual)).sort(byNumber)
  const verbalOptions = Object.keys(hooks.verbal).filter((c) => !fmt || c.startsWith(fmt.verbal)).sort(byNumber)

  async function uploadBenchmark(file: File) {
    setBenchUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/creative/assignments/upload', { method: 'POST', body })
      const d = await res.json()
      if (res.ok) set({ benchmarkUrl: d.url, benchmarkName: d.name })
    } finally {
      setBenchUploading(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className={cn('flex w-full flex-col gap-0 p-0', full ? 'sm:max-w-none' : 'sm:max-w-xl')}>
        <SheetHeader className="border-b px-5 py-4">
          {/* Sits left of the sheet's own close button, which is pinned top
              right by the primitive. */}
          <button
            type="button"
            onClick={() => setFull((f) => !f)}
            aria-label={full ? 'Exit fullscreen' : 'Expand to fullscreen'}
            title={full ? 'Exit fullscreen' : 'Fullscreen'}
            className="absolute right-12 top-3.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {full ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
          </button>
          {isAdmin ? (
            <>
              {/* Radix names the dialog from its title, and an <input> is not
                  one — without this a screen reader announces the sheet with
                  no name at all. Visible title and accessible name are the
                  same string, just rendered twice. */}
              <SheetTitle className="sr-only">{a.title || 'Untitled assignment'}</SheetTitle>
              <input
                value={a.title}
                aria-label="Assignment title"
                onChange={(e) => set({ title: e.target.value })}
                className="w-full border-0 bg-transparent p-0 text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50 focus:outline-none"
                placeholder="Untitled"
              />
            </>
          ) : (
            <SheetTitle className="text-pretty text-xl">{a.title}</SheetTitle>
          )}
        </SheetHeader>

        <div className={cn('flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4', full && 'mx-auto w-full max-w-4xl')}>
          {/* ── Properties ─────────────────────────────────────────────── */}
          <section className="flex flex-col gap-0.5">
            <PropertyRow icon={Signal} label="Status">
              <Choice
                value={a.status}
                editable={isAdmin}
                options={ASSIGNMENT_STATUSES as readonly string[]}
                onChange={(v) => set({ status: v as AssignmentStatus })}
                render={(v) => <Pill tone="blue">{v}</Pill>}
              />
            </PropertyRow>

            {/* The two names this brief produces, directly under the status
                because they are what anyone opening the card is checking.
                Always shown, empty or not: a blank here means the naming
                has not been worked out yet, which is the thing worth
                seeing — hiding the rows made a brief with no names look
                like a brief that did not need any.

                A relaunch generates neither. It is one existing ad going
                back up, so it keeps the ad set and the name it already had
                — read off the source cut rather than left blank. */}
            <PropertyRow icon={Boxes} label="Ad set name">
              {adsetName
                ? <code className="font-mono text-xs">{adsetName}</code>
                : <Empty />}
            </PropertyRow>
            <PropertyRow icon={FileType} label="Creative name">
              {creativeName
                ? <code className="font-mono text-xs">{creativeName}</code>
                : <Empty />}
            </PropertyRow>

            <PropertyRow icon={Star} label="Priority">
              {isAdmin ? (
                <PriorityStars value={a.priority ?? 3} onChange={(p) => set({ priority: p })} />
              ) : (
                <span className="flex items-center gap-2">
                  <PriorityStars value={a.priority ?? 3} size="sm" />
                  <span className="text-muted-foreground">{PRIORITY_LABELS[a.priority ?? 3]}</span>
                </span>
              )}
            </PropertyRow>

            <PropertyRow icon={Sparkles} label="Request type">
              <Choice
                value={a.type}
                editable={isAdmin}
                options={CREATIVE_TYPES as readonly string[]}
                onChange={(v) => set({ type: v as AssignmentType })}
                render={(v) => <Pill>{v}</Pill>}
              />
            </PropertyRow>

            <PropertyRow icon={Building2} label="Firm">
              <Choice
                value={a.firm ?? ''}
                editable={isAdmin}
                options={ASSIGNMENT_FIRMS as readonly string[]}
                onChange={(v) => set({ firm: v as AssignmentFirm })}
                render={(v) => (v ? <Pill>{v}</Pill> : <Empty />)}
              />
            </PropertyRow>

            <PropertyRow icon={Clapperboard} label="Ad format">
              <Choice
                value={a.format ?? ''}
                editable={isAdmin}
                options={CREATIVE_FORMATS.map((f) => f.code)}
                label={(v) => {
                  const f = CREATIVE_FORMATS.find((x) => x.code === v)
                  return f ? `${f.code} · ${f.label}` : v
                }}
                onChange={(v) => {
                  /* Changing the format changes which hook letters are legal,
                     so a code from the old family is cleared rather than left
                     to produce a pairing that could never be named. */
                  const next = CREATIVE_FORMATS.find((f) => f.code === v)
                  set({
                    format: v as CreativeFormat,
                    visualCode: a.visualCode?.startsWith(next?.visual ?? '') ? a.visualCode : undefined,
                    verbalCode: a.verbalCode?.startsWith(next?.verbal ?? '') ? a.verbalCode : undefined,
                  })
                }}
                render={(v) => (v ? <Pill tone="blue">{v}</Pill> : <Empty />)}
              />
            </PropertyRow>

            <PropertyRow icon={Eye} label={`Visual angle${fmt ? ` (${fmt.visual})` : ''}`}>
              <Choice
                value={a.visualCode ?? ''}
                editable={isAdmin}
                options={visualOptions}
                label={(v) => (v ? `${v} · ${hooks.visual[v] ?? ''}` : 'Empty')}
                onChange={(v) => set({ visualCode: v || undefined })}
                render={(v) => (v ? <Pill>{v} · {hooks.visual[v] ?? ''}</Pill> : <Empty />)}
              />
            </PropertyRow>

            <PropertyRow icon={MessageSquare} label={`Verbal angle${fmt ? ` (${fmt.verbal})` : ''}`}>
              <Choice
                value={a.verbalCode ?? ''}
                editable={isAdmin}
                options={verbalOptions}
                label={(v) => (v ? `${v} · ${hooks.verbal[v] ?? ''}` : 'Empty')}
                onChange={(v) => set({ verbalCode: v || undefined, angle: hooks.verbal[v] || a.angle })}
                render={(v) => (v ? <Pill>{v} · {hooks.verbal[v] ?? ''}</Pill> : <Empty />)}
              />
            </PropertyRow>

            <PropertyRow icon={Hash} label="Batch number">
              {isAdmin ? (
                <InlineText value={a.batch ?? ''} placeholder="Empty" onCommit={(v) => set({ batch: v || undefined })} />
              ) : a.batch ? <Pill>{a.batch}</Pill> : <Empty />}
            </PropertyRow>

            <PropertyRow icon={Paperclip} label="Benchmark">
              <input
                ref={benchRef}
                type="file"
                accept="image/*,video/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadBenchmark(f)
                  e.target.value = ''
                }}
              />
              {a.benchmarkUrl ? (
                <span className="flex items-center gap-2">
                  <a href={a.benchmarkUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 truncate hover:underline">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{a.benchmarkName ?? 'Benchmark'}</span>
                  </a>
                  {isAdmin && (
                    <button type="button" onClick={() => benchRef.current?.click()} className="shrink-0 text-xs text-muted-foreground opacity-0 hover:underline group-hover:opacity-100">
                      Replace
                    </button>
                  )}
                </span>
              ) : isAdmin ? (
                <button type="button" onClick={() => benchRef.current?.click()} disabled={benchUploading} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground/60 hover:text-foreground">
                  {benchUploading ? <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Uploading…</> : 'Empty'}
                </button>
              ) : <Empty />}
            </PropertyRow>

            <PropertyRow icon={CalendarDays} label="Request date">
              <span className="text-muted-foreground">
                {new Date(`${a.createdAt}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </PropertyRow>

            <PropertyRow icon={Layers} label="Director">
              <span className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">F</span>
                {ROLE_LABEL.creative}
              </span>
            </PropertyRow>

            {src && (
              <PropertyRow icon={Clapperboard} label="Source creative">
                <code className="font-mono text-xs">{src.convention}</code>
              </PropertyRow>
            )}

            <PropertyRow icon={ScrollText} label="Request" align="start">
              {isAdmin ? (
                /* Edited with the same picker the brief was written with, so
                   a change made here cannot produce a request shaped
                   differently from one made there. */
                <div className="py-1">
                  <RequestPicker value={a.script ?? ''} onChange={(v) => set({ script: v })} idPrefix={`sheet-${a.id}`} />
                </div>
              ) : a.script ? (
                <div className="flex flex-wrap gap-1 py-1">
                  {parseRequests(a.script).picked.map((r) => <Pill key={r}>{r}</Pill>)}
                  {parseRequests(a.script).other && (
                    <p className="w-full text-pretty leading-relaxed">{parseRequests(a.script).other}</p>
                  )}
                </div>
              ) : <Empty />}
            </PropertyRow>

            <PropertyRow icon={Type} label="Brief" align="start">
              {isAdmin ? (
                <InlineArea value={a.notes} placeholder="Empty" onCommit={(v) => set({ notes: v })} />
              ) : a.notes ? <p className="text-pretty py-1 leading-relaxed">{a.notes}</p> : <Empty />}
            </PropertyRow>
          </section>

          {/* ── Versions ───────────────────────────────────────────────── */}
          <section className="px-2">
            <VersionStages
              a={a}
              role={role}
              onUpload={(files, stage) => addAttachments(a.id, role, files, stage)}
              onFeedback={(text, stage) => addComment(a.id, role, text, stage)}
            />
          </section>

        </div>

      </SheetContent>
    </Sheet>
  )
}

/* ── The editable value types ───────────────────────────────────────────── */

/** A picker that reads as a plain value until it is hovered or opened. */
function Choice({
  value, options, onChange, render, label, editable,
}: {
  value: string
  options: readonly string[]
  onChange: (v: string) => void
  render: (v: string) => React.ReactNode
  label?: (v: string) => string
  editable: boolean
}) {
  if (!editable) return <>{render(value)}</>
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : (v as string))}>
      <SelectTrigger className="h-auto w-full justify-start border-0 bg-transparent px-1.5 py-1 shadow-none hover:bg-muted focus:ring-0 data-[state=open]:bg-muted">
        <SelectValue>{(v: string) => (label ? label(v === NONE ? '' : v) : v === NONE ? 'Empty' : v)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Empty</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{label ? label(o) : o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A one-line value that commits on blur, so every keystroke is not a write. */
function InlineText({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft.trim())}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className="w-full rounded px-1.5 py-1 text-sm outline-none hover:bg-muted focus:bg-muted placeholder:text-muted-foreground/60"
    />
  )
}

/** The same, for the brief — grows with its content. */
function InlineArea({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <textarea
      value={draft}
      placeholder={placeholder}
      rows={Math.max(1, draft.split('\n').length)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      className="w-full resize-none rounded px-1.5 py-1 text-sm leading-relaxed outline-none hover:bg-muted focus:bg-muted placeholder:text-muted-foreground/60"
    />
  )
}
