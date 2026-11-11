'use client'

import { useRef, useState } from 'react'
import { FileText, Loader2, Paperclip, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { uploadFile } from '@/app/creative/_lib/uploads'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The benchmark on a brief, after the brief exists.

   A benchmark is the reference the cut is built against, and it is the field
   most likely to be wrong at the moment the brief is raised: the right
   example turns up after the conversation, or the wrong file went on in the
   first place. Until now it could only be set at creation — a task carried
   whatever it was born with, and an assignment could be replaced only
   through a hover-only link with no way to see what was already there and no
   way to take it off at all.

   So: the file is visible, playable in place, replaceable and removable.

   Playable matters more than it sounds. A benchmark is usually a video, and
   the question asked of it — "is this the one I meant" — is answered by
   watching two seconds of it, not by reading a filename or opening a tab.
   ═══════════════════════════════════════════════════════════════════════════ */

export function BenchmarkField({
  url, name, onChange, canEdit, compact,
}: {
  url?: string
  name?: string
  /** Both together: a replace sets them, a remove clears them. */
  onChange: (next: { url?: string; name?: string }) => void
  canEdit: boolean
  /** Tighter layout for a board card, where the row has less to spend. */
  compact?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  /* Video or image, off the stored filename. The URL carries the same
     extension — both uploaders name the file by it — so there is no need to
     ask storage what it holds. */
  const ext = (name ?? url ?? '').split('.').pop()?.toLowerCase() ?? ''
  const isVideo = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(ext)

  async function pick(file: File) {
    setBusy(true)
    setProgress(0)
    try {
      const d = await uploadFile(file, 'benchmark', setProgress)
      onChange({ url: d.url, name: d.name })
      toast(url ? `Benchmark replaced with ${d.name}` : `Benchmark set to ${d.name}`)
    } catch (e) {
      toast.error('The benchmark did not upload', { description: (e as Error).message })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*,video/*"
      className="sr-only"
      onChange={(e) => {
        const f = e.target.files?.[0]
        if (f) void pick(f)
        /* Cleared so picking the same file twice still fires a change —
           after a failed upload that is exactly what someone does. */
        e.target.value = ''
      }}
    />
  )

  if (!url) {
    return (
      <span className="flex items-center gap-2">
        {input}
        {canEdit ? (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground/70 hover:text-foreground"
          >
            {busy
              ? <><Loader2 className="size-3.5 animate-spin" aria-hidden /> {progress === null ? 'Uploading…' : `Uploading ${Math.round(progress * 100)}%`}</>
              : <><Paperclip className="size-3.5" aria-hidden /> Add benchmark</>}
          </button>
        ) : (
          <span className="text-sm text-muted-foreground/70">None</span>
        )}
      </span>
    )
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', compact ? 'w-full' : '')}>
      {input}

      {/* The file itself, not a link to it. A still shows as a still; a
          video shows its first frame and plays where it sits. */}
      {isVideo ? (
        playing ? (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-48 w-full rounded-md border bg-black object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group/bench relative flex h-24 w-full items-center justify-center overflow-hidden rounded-md border bg-muted"
            aria-label={`Play ${name ?? 'the benchmark'}`}
          >
            {/* preload=metadata so the poster frame arrives without pulling
                a 300MB file down to show a thumbnail. */}
            <video src={`${url}#t=0.1`} preload="metadata" muted className="absolute inset-0 size-full object-cover" />
            <span className="relative flex size-9 items-center justify-center rounded-full bg-background/90 shadow-sm transition-transform group-hover/bench:scale-105">
              <Play className="size-4 translate-x-px" aria-hidden />
            </span>
          </button>
        )
      ) : isImage ? (
        <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border">
          <img src={url} alt={name ?? 'Benchmark'} className="h-24 w-full object-cover" />
        </a>
      ) : null}

      <div className="flex min-w-0 items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm hover:underline"
        >
          <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{name ?? 'Benchmark'}</span>
        </a>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => ref.current?.click()}
              disabled={busy}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {busy ? (progress === null ? 'Uploading…' : `${Math.round(progress * 100)}%`) : 'Replace'}
            </button>
            <button
              type="button"
              aria-label="Remove benchmark"
              title="Remove benchmark"
              onClick={() => {
                onChange({ url: undefined, name: undefined })
                toast('Benchmark removed')
              }}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
