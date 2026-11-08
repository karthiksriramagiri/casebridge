'use client'

import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { Textarea } from '@/app/creative/_ui/textarea'
import { CREATIVE_REQUESTS, joinRequests, parseRequests } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* What is being asked for.

   This was a free-text "Script to use" box, and the same few instructions
   were typed into it every day — "add the LHP disclaimer", "LHP disclaimer",
   "same as benchmark pls" — which reads as four different asks when it is
   one. The standing requests are now a fixed list, several can apply at
   once, and Other takes anything the list does not cover.

   Multi-select because the real ask is often two things: same as the
   benchmark, and add a disclaimer. */
export function RequestPicker({
  value, onChange, idPrefix,
}: {
  value: string
  onChange: (v: string) => void
  idPrefix: string
}) {
  const { picked, other } = parseRequests(value)
  const set = new Set(picked)

  /* The last value emitted, which is ahead of `value` until the parent has
     re-rendered. Two pills tapped in quick succession both ran against the
     render they were created in, so the second overwrote the first and only
     one selection stuck. */
  const latest = useRef(value)
  useEffect(() => { latest.current = value }, [value])

  const emit = (next: Set<string>, nextOther: string) => {
    /* Kept in the list's own order rather than the order they were clicked,
       so two briefs asking for the same things read identically. */
    const v = joinRequests(CREATIVE_REQUESTS.filter((x) => next.has(x)), nextOther)
    latest.current = v
    onChange(v)
  }

  const toggle = (r: string) => {
    const cur = parseRequests(latest.current)
    const next = new Set(cur.picked)
    next.has(r) ? next.delete(r) : next.add(r)
    emit(next, cur.other)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {CREATIVE_REQUESTS.map((r) => {
          const on = set.has(r)
          return (
            <button
              key={r}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(r)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-card text-foreground hover:bg-muted',
              )}
            >
              {on && <Check className="size-3" aria-hidden />}
              {r}
            </button>
          )
        })}
      </div>

      {/* Always visible rather than behind an "Other" toggle: a request that
          needs typing is the one you must not have to go looking for. */}
      <Textarea
        id={`${idPrefix}-request-other`}
        rows={2}
        placeholder="Other — anything the list above does not cover"
        value={other}
        onChange={(e) => emit(new Set(parseRequests(latest.current).picked), e.target.value)}
      />
    </div>
  )
}
