'use client'

import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/creative/_ui/dialog'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The ad, played.

   A thumbnail is the first frame. Every question actually asked of a video
   in the ad meeting — where does the hook land, how long before the offer,
   is this the cut we think it is — is about what happens after it, and
   answering any of them meant finding the ad in Ads Manager.

   The file is fetched when the dialog opens, never with the row. A table of
   171 ads resolving a video source each would make 342 Graph calls to paint
   a page where nobody has clicked anything yet.

   An image ad opens too, showing the still at full size rather than the
   36-pixel crop in the row. Clicking a thumbnail does something either way,
   which is the point: a click that works on some rows and silently does
   nothing on others reads as broken.
   ═══════════════════════════════════════════════════════════════════════════ */

type Found =
  | { state: 'loading' }
  | { state: 'video'; source: string; poster: string | null }
  | { state: 'image' }
  | { state: 'error'; message: string }

export function CreativePlayer({
  adId,
  account,
  title,
  subtitle,
  format,
  open,
  onOpenChange,
}: {
  adId: string
  account: string
  title: string
  subtitle?: string
  format: 'Video' | 'Image'
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [found, setFound] = useState<Found>({ state: 'loading' })

  useEffect(() => {
    if (!open) return
    /* An image ad never asks Meta for a file — the still is already served
       by the thumbnail proxy at full resolution. */
    if (format !== 'Video') { setFound({ state: 'image' }); return }

    let live = true
    setFound({ state: 'loading' })
    fetch(`/api/creative/video?id=${encodeURIComponent(adId)}&account=${encodeURIComponent(account)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return
        if (d.source) setFound({ state: 'video', source: d.source, poster: d.poster ?? null })
        else if (d.video === false) setFound({ state: 'image' })
        else setFound({ state: 'error', message: d.error ?? 'Meta did not return the file.' })
      })
      .catch((e: Error) => live && setFound({ state: 'error', message: e.message }))
    return () => { live = false }
  }, [open, adId, account, format])

  const still = `/api/creative/thumb?id=${encodeURIComponent(adId)}&account=${encodeURIComponent(account)}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-pretty text-sm leading-snug">{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {found.state === 'loading' && (
            <p className="py-16 text-sm text-muted-foreground">Fetching the file from Meta…</p>
          )}
          {found.state === 'video' && (
            // eslint-disable-next-line jsx-a11y/media-has-caption -- an ad has no caption track
            <video
              src={found.source}
              poster={found.poster ?? still}
              controls
              autoPlay
              playsInline
              className="max-h-[70vh] w-full"
            />
          )}
          {found.state === 'image' && (
            <img src={still} alt={title} className="max-h-[70vh] w-full object-contain" />
          )}
          {found.state === 'error' && (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              {found.message}
              <br />
              <span className="text-xs">The still is still available on the row.</span>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* The thumbnail, made to open. A button rather than a click handler on the
   image, so it is reachable by keyboard and announces what it does. */
export function PlayableThumb({
  c,
  title,
  subtitle,
  children,
  className,
}: {
  c: { adId: string; account?: string; format: 'Video' | 'Image' }
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  /* Nothing to open for a creative that never came from Meta — there is no
     ad id to ask about, and a button that cannot answer is worse than a
     plain picture. */
  if (!c.account) return <>{children}</>

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={c.format === 'Video' ? `Play ${title}` : `View ${title}`}
        title={c.format === 'Video' ? 'Play the ad' : 'View the full-size still'}
        className={cn('group/thumb relative shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2', className)}
      >
        {children}
        {c.format === 'Video' && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center rounded-md bg-black/35 opacity-0 transition-opacity group-hover/thumb:opacity-100"
          >
            <Play className="size-3.5 fill-white text-white" />
          </span>
        )}
      </button>
      {open && (
        <CreativePlayer
          adId={c.adId}
          account={c.account}
          title={title}
          subtitle={subtitle}
          format={c.format}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  )
}
