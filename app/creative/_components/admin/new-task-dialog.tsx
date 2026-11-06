'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Paperclip, X } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/creative/_ui/dialog'
import { Input } from '@/app/creative/_ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { Textarea } from '@/app/creative/_ui/textarea'
import { TODAY } from '@/app/creative/_lib/data'
import { useStore } from '@/app/creative/_lib/store'
import {
  ASSIGNMENT_FIRMS, CREATIVE_FORMATS, TASK_TYPES,
  type AssignmentFirm, type CreativeFormat, type KTaskType,
} from '@/app/creative/_lib/types'
import { PriorityStars } from './priority-stars'

/* ═══════════════════════════════════════════════════════════════════════════
   Jason briefing himself.

   The same form Faisal's assignments use, because the output is the same
   thing — an ad with the same name, needing the same firm, format, hooks and
   batch:

     1105 | B000123 | LHP | BNR | G1 | H4

   Only the work differs, so only the type list does: resize, change the text,
   translate. Everything else is shared, which also means one place to change
   when the naming convention moves.
   ═══════════════════════════════════════════════════════════════════════════ */

type HookTables = { visual: Record<string, string>; verbal: Record<string, string> }

const NONE = '__none'
const byNumber = (a: string, b: string) => (parseInt(a.slice(1), 10) || 0) - (parseInt(b.slice(1), 10) || 0)

export function NewTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { addKTask } = useStore()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<KTaskType>(TASK_TYPES[0])
  const [firm, setFirm] = useState<AssignmentFirm>(ASSIGNMENT_FIRMS[0])
  const [format, setFormat] = useState<CreativeFormat>('BR')
  const [visualCode, setVisualCode] = useState(NONE)
  const [verbalCode, setVerbalCode] = useState(NONE)
  const [batch, setBatch] = useState('')
  const [priority, setPriority] = useState(3)
  const [script, setScript] = useState('')
  const [notes, setNotes] = useState('')

  const [hooks, setHooks] = useState<HookTables>({ visual: {}, verbal: {} })
  const [bench, setBench] = useState<{ url: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    fetch('/api/creative/hooks')
      .then((r) => r.json())
      .then((d) => live && setHooks({ visual: d.visual ?? {}, verbal: d.verbal ?? {} }))
      .catch(() => {})
    return () => { live = false }
  }, [open])

  const config = CREATIVE_FORMATS.find((f) => f.code === format) ?? CREATIVE_FORMATS[0]
  const visualOptions = useMemo(
    () => Object.keys(hooks.visual).filter((c) => c.startsWith(config.visual)).sort(byNumber),
    [hooks.visual, config.visual],
  )
  const verbalOptions = useMemo(
    () => Object.keys(hooks.verbal).filter((c) => c.startsWith(config.verbal)).sort(byNumber),
    [hooks.verbal, config.verbal],
  )

  useEffect(() => {
    setVisualCode((c) => (c !== NONE && !c.startsWith(config.visual) ? NONE : c))
    setVerbalCode((c) => (c !== NONE && !c.startsWith(config.verbal) ? NONE : c))
  }, [config.visual, config.verbal])

  async function uploadBenchmark(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/creative/assignments/upload', { method: 'POST', body })
      const d = await res.json()
      if (!res.ok) { setUploadError(d.error ?? 'Upload failed.'); return }
      setBench({ url: d.url, name: d.name })
    } catch {
      setUploadError('Could not reach the server.')
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setTitle(''); setNotes(''); setBatch(''); setScript('')
    setVisualCode(NONE); setVerbalCode(NONE); setPriority(3)
    setBench(null); setUploadError(null)
  }

  const datePrefix = `${TODAY.slice(5, 7)}${TODAY.slice(8, 10)}`
  const preview = [
    datePrefix,
    batch.trim() || '······',
    firm,
    format,
    visualCode !== NONE ? visualCode : '··',
    verbalCode !== NONE ? verbalCode : '··',
  ].join(' | ')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Goes on your own board — resize, text changes and translations.</DialogDescription>
        </DialogHeader>

        <form
          id="new-task"
          className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            addKTask({
              title: title.trim(),
              type,
              notes,
              firm,
              format,
              visualCode: visualCode === NONE ? undefined : visualCode,
              verbalCode: verbalCode === NONE ? undefined : verbalCode,
              batch: batch.trim() || undefined,
              priority,
              script: script.trim() || undefined,
              benchmarkUrl: bench?.url,
              benchmarkName: bench?.name,
            })
            reset()
            onOpenChange(false)
          }}
        >
          <Field label="Title" htmlFor="t-title">
            <Input id="t-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Firm" htmlFor="t-firm">
              <Select value={firm} onValueChange={(v) => setFirm(v as AssignmentFirm)}>
                <SelectTrigger id="t-firm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_FIRMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Creative type" htmlFor="t-format">
              <Select value={format} onValueChange={(v) => setFormat(v as CreativeFormat)}>
                <SelectTrigger id="t-format" className="w-full">
                  <SelectValue>
                    {(v: string) => {
                      const f = CREATIVE_FORMATS.find((x) => x.code === v)
                      return f ? `${f.code} · ${f.label}` : v
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CREATIVE_FORMATS.map((f) => (
                    <SelectItem key={f.code} value={f.code}>{f.code} · {f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={`Visual angle (${config.visual})`}
              htmlFor="t-visual"
              hint={visualOptions.length === 0 ? `No ${config.visual} hooks named yet — add them on the Angles page.` : undefined}
            >
              <Select value={visualCode} onValueChange={(v) => setVisualCode(v as string)}>
                <SelectTrigger id="t-visual" className="w-full">
                  <SelectValue>{(v: string) => (v === NONE ? 'Not set' : `${v} · ${hooks.visual[v] ?? ''}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {visualOptions.map((c) => <SelectItem key={c} value={c}>{c} · {hooks.visual[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={`Verbal angle (${config.verbal})`}
              htmlFor="t-verbal"
              hint={verbalOptions.length === 0 ? `No ${config.verbal} hooks named yet — add them on the Angles page.` : undefined}
            >
              <Select value={verbalCode} onValueChange={(v) => setVerbalCode(v as string)}>
                <SelectTrigger id="t-verbal" className="w-full">
                  <SelectValue>{(v: string) => (v === NONE ? 'Not set' : `${v} · ${hooks.verbal[v] ?? ''}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {verbalOptions.map((c) => <SelectItem key={c} value={c}>{c} · {hooks.verbal[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Batch number" htmlFor="t-batch">
              <Input id="t-batch" value={batch} placeholder="0826" onChange={(e) => setBatch(e.target.value)} />
            </Field>

            <Field label="Task type" htmlFor="t-type">
              <Select value={type} onValueChange={(v) => setType(v as KTaskType)}>
                <SelectTrigger id="t-type" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Priority" hint="Five stars is most urgent. The board puts the highest at the top of its column.">
            <PriorityStars value={priority} onChange={setPriority} />
          </Field>

          <Field label="Benchmark creative" hint="The reference to work from — an image or a video, up to 50MB.">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadBenchmark(f)
                e.target.value = ''
              }}
            />
            {bench ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a href={bench.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{bench.name}</a>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove benchmark" onClick={() => setBench(null)}>
                  <X aria-hidden />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <><Loader2 className="animate-spin" aria-hidden /> Uploading…</> : <><Paperclip aria-hidden /> Upload benchmark</>}
              </Button>
            )}
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
          </Field>

          <Field label="Script to use" htmlFor="t-script" hint="What the cut should say. “Same as the benchmark” is a complete answer.">
            <Textarea id="t-script" rows={2} value={script} onChange={(e) => setScript(e.target.value)} />
          </Field>

          <Field label="Brief / notes" htmlFor="t-notes">
            <Textarea id="t-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">{preview}</p>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="new-task" disabled={uploading}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label, htmlFor, hint, children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
