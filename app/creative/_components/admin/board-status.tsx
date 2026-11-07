'use client'

import { TriangleAlert } from 'lucide-react'
import { useStore } from '@/app/creative/_lib/store'

/* Why a board is empty.

   The watch, kill and launch lists used to be React state with no table
   behind them: a refresh wiped the day's decisions and the page just looked
   empty, as though nothing had been decided. They persist now — but the
   migration is run by hand, so until it is, every write is refused and the
   page would look exactly as wrong as it did before. This says so. */
export function BoardStatus({ migration }: { migration: string }) {
  const { boardSetupNeeded, boardError } = useStore()

  if (boardSetupNeeded) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">This board has no table yet — nothing here will save</p>
          <p className="text-muted-foreground">
            Run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{migration}</code>{' '}
            in the Supabase SQL editor. Until then the list stays empty on every reload.
          </p>
        </div>
      </div>
    )
  }

  if (boardError) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
        {boardError}
      </p>
    )
  }

  return null
}
