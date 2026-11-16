'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Phone, Search, X } from 'lucide-react'
import { Pill } from './shell'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Find one lead, anywhere, and call it.

   The search boxes this replaces were scoped to a pipeline stage, so
   finding a person meant knowing which stage they were in — which is the
   one thing a rep holding a name does not know. This asks the whole book
   and hands back something dialable.

   Debounced, because it fires on a keystroke and the endpoint reads two
   tables. 250ms is under the gap between words typed at speed, so a rep
   typing a full name makes one request rather than nine.

   A signed case is flagged rather than hidden. Calling one is usually a
   mistake but not always — a replacement, a passenger on the same
   accident — and a search that silently omits people is worse than one
   that warns.
   ═══════════════════════════════════════════════════════════════════════════ */

export type LeadHit = {
  contactId: string
  name: string
  phone: string
  email: string | null
  firm: string | null
  firmId: string | null
  stageName: string | null
  signed: boolean
  lastCalledAt: string | null
}

export function LeadSearch({
  onPick,
  disabled,
  disabledReason,
  placeholder = 'Search any lead — name or number',
  autoFocus,
  className,
}: {
  /** What to do with the lead that was chosen. */
  onPick: (lead: LeadHit) => void
  /** True when calling is not possible right now. The list still opens. */
  disabled?: boolean
  disabledReason?: string
  placeholder?: string
  autoFocus?: boolean
  className?: string
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<LeadHit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const needle = q.trim()
    if (needle.length < 2) { setHits([]); setLoading(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const d = await fetch(`/api/dialer/leads/search?q=${encodeURIComponent(needle)}`).then((r) => r.json())
        setHits(d.leads ?? [])
        setOpen(true)
      } catch {
        setHits([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  /* Clicking anywhere else closes the results. Without it the list sits
     over the page after a rep has moved on. */
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const pick = (lead: LeadHit) => {
    if (disabled) return
    onPick(lead)
    setQ('')
    setHits([])
    setOpen(false)
  }

  return (
    <div ref={box} className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        placeholder={placeholder}
        aria-label="Search every lead"
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-input bg-card py-2 pl-8 pr-8 text-sm focus:border-primary focus:outline-none"
      />
      {loading && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      {!loading && q && (
        <button
          type="button"
          onClick={() => { setQ(''); setHits([]); setOpen(false) }}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}

      {open && q.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {loading ? 'Searching…' : 'No lead matches that.'}
            </p>
          ) : (
            hits.map((lead) => (
              <button
                key={lead.contactId}
                type="button"
                onClick={() => pick(lead)}
                disabled={disabled}
                title={disabled ? disabledReason : `Call ${lead.name}`}
                className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left last:border-0 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{lead.name}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{lead.phone}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {lead.firm && <Pill>{lead.firm.toUpperCase()}</Pill>}
                  {lead.signed
                    ? <Pill tone="green">signed</Pill>
                    : lead.stageName && <Pill tone="blue">{lead.stageName}</Pill>}
                  <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
