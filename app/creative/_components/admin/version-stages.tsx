'use client'

import { useRef, useState } from 'react'
import { ChevronRight, FileText, Upload } from 'lucide-react'
import { Textarea } from '@/app/creative/_ui/textarea'
import { Button } from '@/app/creative/_ui/button'
import { VERSION_STAGES, ROLE_LABEL, type Assignment, type Role, type VersionStage } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The cut, the notes on it, and the cut after that.

   A brief is not one upload. It is a first version, feedback on it, a second
   version, feedback on that, and a final — and the thing everyone needs to
   know at a glance is which of those is current and what was said about the
   one before. One undifferentiated pile of files cannot answer either.

   Each stage drops its own files, so "Remake V2" is a place rather than a
   naming convention somebody has to remember to follow.
   ═══════════════════════════════════════════════════════════════════════════ */

export function VersionStages({
  a, role, onUpload, onFeedback,
}: {
  a: Assignment
  role: Role
  onUpload: (files: File[], stage: VersionStage) => void
  onFeedback: (text: string, stage: VersionStage) => void
}) {
  return (
    <div className="flex flex-col">
      {VERSION_STAGES.map(({ key, label, feedback }) => (
        <div key={key} className="border-t first:border-t-0">
          <StageDrop
            label={label}
            files={a.attachments.filter((f) => f.stage === key)}
            onUpload={(files) => onUpload(files, key)}
          />
          {feedback && (
            <FeedbackList
              label={feedback}
              role={role}
              comments={a.comments.filter((c) => c.stage === key)}
              onAdd={(text) => onFeedback(text, key)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function Section({
  label, tone = 'plain', children, count,
}: {
  label: string
  tone?: 'plain' | 'code'
  children: React.ReactNode
  count?: number
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className="py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
        <span
          className={cn(
            tone === 'code'
              ? 'rounded bg-success/15 px-1.5 py-0.5 font-mono text-xs font-medium text-success'
              : 'text-sm font-semibold',
          )}
        >
          {label}
        </span>
        {count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
      </button>
      {open && <div className="pl-7 pr-2 pt-1">{children}</div>}
    </section>
  )
}

/** A stage's files, with a drop zone that also takes a click. */
function StageDrop({
  label, files, onUpload,
}: {
  label: string
  files: Assignment['attachments']
  onUpload: (files: File[]) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <Section label={label} count={files.length}>
      <input
        ref={ref}
        type="file"
        multiple
        accept="image/*,video/*"
        className="sr-only"
        aria-label={`Upload to ${label}`}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? [])
          if (list.length) onUpload(list)
          e.target.value = ''
        }}
      />

      {files.length > 0 && (
        <ul className="mb-2 grid grid-cols-4 gap-2">
          {files.map((f) => (
            <li key={f.id} className="flex flex-col gap-1">
              <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border bg-muted">
                {f.kind === 'image' ? (
                  <img src={f.url} alt={f.name} className="size-full object-cover" />
                ) : f.kind === 'video' ? (
                  <video src={f.url} muted className="size-full object-cover" aria-label={f.name} />
                ) : (
                  <span className="flex size-full items-center justify-center">
                    <FileText className="size-5 text-muted-foreground" aria-hidden />
                  </span>
                )}
              </a>
              <span className="truncate text-[10px] text-muted-foreground">{f.name}</span>
            </li>
          ))}
        </ul>
      )}

      {/* The whole area is the target, not just a button — a file being
          dragged from a Finder window lands wherever it is dropped. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ref.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const list = Array.from(e.dataTransfer.files ?? [])
          if (list.length) onUpload(list)
        }}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-colors',
          over ? 'border-primary bg-primary/5 text-foreground' : 'hover:border-muted-foreground/40 hover:bg-muted/50',
        )}
      >
        <Upload className="size-4 shrink-0" aria-hidden />
        {over ? 'Drop to upload' : 'Upload or drop a file'}
      </div>
    </Section>
  )
}

/** The notes on a version, as a running list. */
function FeedbackList({
  label, role, comments, onAdd,
}: {
  label: string
  role: Role
  comments: Assignment['comments']
  onAdd: (text: string) => void
}) {
  const [text, setText] = useState('')
  const submit = () => {
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }

  return (
    <Section label={label} tone="code" count={comments.length}>
      {comments.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2 text-sm">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
              <span className="min-w-0">
                <span className="text-pretty leading-snug">{c.text}</span>
                <span className="pl-1.5 text-[11px] text-muted-foreground">— {ROLE_LABEL[c.author]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => { e.preventDefault(); submit() }}
      >
        <Textarea
          rows={1}
          value={text}
          aria-label={`Add ${label}`}
          placeholder="Add a note…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              submit()
            }
          }}
          className="min-h-0 resize-none text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!text.trim()}>Add</Button>
      </form>
    </Section>
  )
}
