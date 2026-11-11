'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/creative/_ui/dialog'
import { downloadCsv, matchesQuery, Pill, SearchBox, Thumb } from '@/app/creative/_components/admin/shared'
import { formatDate, num, pct, totalsFor, usd } from '@/app/creative/_lib/metrics'
import { firmName } from '@/app/_metrics/firms'
import type { Creative } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Everything that has ever been killed, or ever been launched.

   The kill list and the launch list are both day pages: they answer "what is
   today's work", and stepping back a day at a time is how you read an older
   one. That is the right shape for doing the work and the wrong one for the
   question that gets asked afterwards — "have we run this before", "when did
   we kill that one", "what did it cost us before we pulled it".

   So this is the same records with the day taken out: one flat table, every
   row ever written, newest first, searchable and sortable. It opens over the
   page rather than replacing it, because it is something you check and close
   rather than somewhere you work.

   The numbers are the ad's lifetime, not the day's — a killed ad's CPL is
   what it cost over its whole run, which is the figure that explains the
   decision. An ad that has dropped out of Meta's 30-day window has no
   numbers left to read, and says so rather than printing zeroes: this table
   goes back further than the figures behind it do.
   ═══════════════════════════════════════════════════════════════════════════ */

export type HistoryRow = {
  id: string
  /** The creative's name as it was recorded, even if the ad is long gone. */
  name: string
  adset?: string
  firm?: string
  /** The day it happened — killed, or launched. */
  date: string
  /** Live ad, when it is still inside Meta's window. Absent is normal. */
  c?: Creative
  /** A word for what kind of row this is: Killed, Fatigued, Relaunch… */
  tag?: string
  tone?: 'muted' | 'blue' | 'red' | 'green' | 'amber'
}

type SortKey = 'date' | 'name' | 'firm' | 'spend' | 'leads' | 'cpl' | 'signed' | 'cpa'

export function HistoryDialog({
  open, onOpenChange, title, description, dateLabel, rows, csvName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  /** What the date column is called — "Date killed", "Date launched". */
  dateLabel: string
  rows: HistoryRow[]
  csvName: string
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key
      ? { key, dir: s.dir === 1 ? -1 : 1 }
      /* Dates and money open at their most useful end — newest, biggest —
         and names open A to Z. */
      : { key, dir: key === 'name' || key === 'firm' ? 1 : -1 }))

  const found = useMemo(
    () => rows.filter((r) => matchesQuery(query, [r.name, r.adset, r.firm, r.firm ? firmName(r.firm) : '', r.tag, r.date, r.c?.adId, r.c?.angle])),
    [rows, query],
  )

  const ranked = useMemo(() => {
    const value = (r: HistoryRow): string | number | null => {
      const t = r.c ? totalsFor(r.c, 'max') : null
      switch (sort.key) {
        case 'date': return r.date
        case 'name': return r.name.toLowerCase()
        case 'firm': return (r.firm ? firmName(r.firm) : '').toLowerCase()
        case 'spend': return t ? t.spend : null
        case 'leads': return t ? t.leads : null
        case 'cpl': return t?.cpl ?? null
        case 'signed': return t ? t.rangeAcquisitions : null
        case 'cpa': return t?.rangeCpa ?? null
      }
    }
    return [...found].sort((a, b) => {
      const av = value(a), bv = value(b)
      /* A row with no numbers left sits at the bottom whichever way the
         column points — it is not a zero, it is an absence. */
      if (av === null && bv === null) return a.date < b.date ? 1 : -1
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * sort.dir
      }
      return (av - bv) * sort.dir
    })
  }, [found, sort])

  const withNumbers = found.filter((r) => r.c).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[96vw] flex-col gap-0 p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            label={`Search ${title.toLowerCase()}`}
            placeholder="Search name, ad set, firm"
          />
          <span className="text-xs text-muted-foreground">
            {query.trim() ? `${found.length} of ${rows.length}` : `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`}
            {withNumbers < found.length && ` · ${found.length - withNumbers} too old for Meta to still report`}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() =>
              downloadCsv(csvName, [
                [dateLabel, 'Creative', 'Ad set', 'Firm', 'Kind', 'Spend', 'Leads', 'CPL', 'Signed', 'CPA'],
                ...ranked.map((r) => {
                  const t = r.c ? totalsFor(r.c, 'max') : null
                  return [
                    r.date, r.name, r.adset ?? '', r.firm ? firmName(r.firm) : '', r.tag ?? '',
                    t ? Math.round(t.spend) : '', t ? t.leads : '',
                    t?.cpl != null ? Math.round(t.cpl) : '',
                    t ? t.rangeAcquisitions : '',
                    t?.rangeCpa != null ? Math.round(t.rangeCpa) : '',
                  ]
                }),
              ])
            }
          >
            <Download aria-hidden /> Export
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {ranked.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? 'Nothing here yet.' : `Nothing matches “${query.trim()}”.`}
            </p>
          ) : (
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur">
                <tr>
                  <Head col="date" sort={sort} onSort={sortBy} align="left">{dateLabel}</Head>
                  <Head col="name" sort={sort} onSort={sortBy} align="left">Creative</Head>
                  <Head col="firm" sort={sort} onSort={sortBy} align="left">Firm</Head>
                  <Head col="spend" sort={sort} onSort={sortBy}>Spend</Head>
                  <Head col="leads" sort={sort} onSort={sortBy}>Leads</Head>
                  <Head col="cpl" sort={sort} onSort={sortBy}>CPL</Head>
                  <Head col="signed" sort={sort} onSort={sortBy}>Signed</Head>
                  <Head col="cpa" sort={sort} onSort={sortBy}>CPA</Head>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Hook</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => {
                  const t = r.c ? totalsFor(r.c, 'max') : null
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/40">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="flex flex-col">
                          <span className="font-medium">{formatDate(r.date)}</span>
                          {r.tag && <Pill tone={r.tone ?? 'muted'}>{r.tag}</Pill>}
                        </div>
                      </td>
                      <td className="max-w-[360px] px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {r.c && <Thumb c={r.c} />}
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{r.name}</span>
                            {r.adset && <span className="truncate text-[11px] text-muted-foreground">{r.adset}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{r.firm ? firmName(r.firm) : '—'}</td>
                      {t ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums">{usd(t.spend, 0)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{t.leads || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">{usd(t.cpl)}</td>
                          <td className={cn('px-3 py-2.5 text-right tabular-nums', t.rangeAcquisitions > 0 && 'font-semibold text-success')}>
                            {t.rangeAcquisitions || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{usd(t.rangeCpa)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{pct(t.hookRate)}</td>
                        </>
                      ) : (
                        /* One honest cell instead of six empty ones. */
                        <td colSpan={6} className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                          Outside Meta’s reporting window — no figures left to read
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="sticky bottom-0 border-t bg-muted/95 text-xs backdrop-blur">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5 font-medium uppercase tracking-wide text-muted-foreground">
                    {ranked.length} {ranked.length === 1 ? 'record' : 'records'}
                  </td>
                  <Totals rows={ranked} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* The columns that can be added up. Only over the rows that still have
   numbers — a total that silently skips half the table would read as the
   whole of it, so the count beside the search says how many are missing. */
function Totals({ rows }: { rows: HistoryRow[] }) {
  const live = rows.map((r) => r.c).filter((c): c is Creative => !!c).map((c) => totalsFor(c, 'max'))
  const spend = live.reduce((a, t) => a + t.spend, 0)
  const leads = live.reduce((a, t) => a + t.leads, 0)
  const signed = live.reduce((a, t) => a + t.rangeAcquisitions, 0)
  return (
    <>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{usd(spend, 0)}</td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{num(leads)}</td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{leads ? usd(spend / leads, 0) : '—'}</td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{num(signed)}</td>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{signed ? usd(spend / signed, 0) : '—'}</td>
      <td />
    </>
  )
}

function Head({
  col, sort, onSort, align = 'right', children,
}: {
  col: SortKey
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  const active = sort.key === col
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2.5 font-medium', align === 'left' ? 'text-left' : 'text-right')}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          'inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {children}
        {active && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
      </button>
    </th>
  )
}
