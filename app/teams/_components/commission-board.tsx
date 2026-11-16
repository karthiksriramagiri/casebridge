'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, ExternalLink } from 'lucide-react'
import {
  downloadCsv, EmptyState, matchesQuery, PageBody, PageHeader, Pill, SearchBox, StatCard,
} from '@/app/teams/_components/shared'

/* ═══════════════════════════════════════════════════════════════════════════
   The commission board.

   Every case every rep closed in a month, what it pays, and what has
   happened to it since. One table, because the question it answers — "what
   are we paying out, and how much of it is at risk" — cannot be answered by
   looking at one rep at a time.

   Three things a row can say beyond the money:

     OT     closed on overtime, so it pays a flat rate rather than the tier.
     MIA    the case went quiet after signing. The commission is still owed
            but the case may not survive, so it is counted separately rather
            than deducted — nobody has decided it is lost.
     ↻      somebody got through. The MIA board moved it past the first
            column, which is the difference between money at risk and money
            saved, and the link goes to that board.

   The figures come from the API, which reads them from the same function
   the Financial Center bills with. Nothing on this page computes pay.
   ═══════════════════════════════════════════════════════════════════════════ */

type Mia = {
  id: string
  status: string
  owner: string | null
  movedAt: string
  note: string
  reconnected: boolean
}

type Row = {
  id: string
  name: string
  closer: string | null
  firm: string | null
  invoiceCode: string | null
  signedDay: string
  isReplacement: boolean
  otClose: boolean
  commission: number | null
  tier: number | null
  mia: Mia | null
}

type Board = {
  month: string
  months: string[]
  rows: Row[]
  reps: { closer: string; cases: number; ot: number; mia: number; atRisk: number; total: number }[]
  totals: {
    cases: number; replacements: number; ot: number; mia: number
    reconnected: number; commission: number; atRisk: number
  }
  miaSetupNeeded?: boolean
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/* The MIA columns, in the order the work moves. Red is the only one that
   means "still lost"; everything after it is somebody having got through. */
const MIA_TONE: Record<string, 'red' | 'amber' | 'blue' | 'green'> = {
  mia: 'red', reconnected: 'amber', confirmed: 'blue', safe: 'green',
}
const MIA_LABEL: Record<string, string> = {
  mia: 'MIA', reconnected: 'Reconnected', confirmed: 'Confirmed', safe: 'Safe',
}

export function CommissionBoard({ scope = 'all' }: { scope?: 'all' | 'mine' }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [month, setMonth] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  /* Which rows to show. "At risk" is the one an admin opens this page for
     on a bad week, so it is a filter rather than a sort. */
  const [filter, setFilter] = useState<'all' | 'ot' | 'mia' | 'risk'>('all')

  const load = useCallback(async (ym?: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/teams/admin/commission-board${ym ? `?month=${ym}` : ''}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Could not load the board.'); return }
      setBoard(d)
      setMonth(d.month)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    if (!board) return []
    return board.rows.filter((r) => {
      if (filter === 'ot' && !r.otClose) return false
      if (filter === 'mia' && !r.mia) return false
      if (filter === 'risk' && !(r.mia && !r.mia.reconnected)) return false
      return matchesQuery(query, [r.name, r.closer, r.firm, r.invoiceCode])
    })
  }, [board, query, filter])

  const t = board?.totals

  return (
    <>
      <PageHeader
        title={scope === 'mine' ? 'Commissions' : 'Commission Board'}
        description={
          board
            ? scope === 'mine'
              ? `${monthLabel(board.month)} · every case you closed`
              : `${monthLabel(board.month)} · every case, every rep`
            : 'Loading…'
        }
        actions={
          <>
            <select
              value={month}
              onChange={(e) => { setMonth(e.target.value); load(e.target.value) }}
              aria-label="Month"
              className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm"
            >
              {(board?.months ?? []).map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!board || rows.length === 0}
              onClick={() =>
                downloadCsv(`commissions-${board!.month}.csv`, [
                    ['Signed', 'Case', 'Rep', 'Firm', 'Invoice', 'Tier', 'OT', 'Commission', 'MIA', 'Reconnected'],
                  ...rows.map((r) => [
                    r.signedDay, r.name, r.closer ?? '', r.firm ?? '', r.invoiceCode ?? '',
                    r.tier ?? '', r.otClose ? 'yes' : '', r.commission ?? '',
                    r.mia ? MIA_LABEL[r.mia.status] ?? r.mia.status : '',
                    r.mia ? (r.mia.reconnected ? 'yes' : 'no') : '',
                  ]),
                ])
              }
              className="flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <Download className="size-4" aria-hidden /> Export
            </button>
          </>
        }
      />

      <PageBody>
        {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

        {board?.miaSetupNeeded && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
            The MIA board has not been set up, so no case can show as MIA here. Run{' '}
            <code>supabase/migration_mia_center.sql</code>.
          </p>
        )}

        {/* The month in six figures. "At risk" is commission already earned
            on cases that have gone quiet — owed, but on a case that may not
            survive. It is not deducted from the total: nobody has decided
            it is lost, and this board should not decide it either. */}
        <section aria-label="Month totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Commission" value={t ? money(t.commission) : '—'} hint="owed this month" />
          <StatCard label="Cases" value={t ? String(t.cases) : '—'} hint={t?.replacements ? `${t.replacements} replacements` : 'signed'} />
          <StatCard label="OT closes" value={t ? String(t.ot) : '—'} hint="flat rate" />
          <StatCard label="Gone MIA" value={t ? String(t.mia) : '—'} tone={t?.mia ? 'bad' : undefined} hint="after signing" />
          <StatCard label="Reconnected" value={t ? String(t.reconnected) : '—'} tone={t?.reconnected ? 'good' : undefined} hint="someone got through" />
          <StatCard label="At risk" value={t ? money(t.atRisk) : '—'} tone={t?.atRisk ? 'bad' : undefined} hint="MIA, not yet reached" />
        </section>

        {/* Per rep. The top line of the month — who closed what and how much
            of their own pay is sitting on a case nobody can reach. */}
        {scope === 'all' && board && board.reps.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-2.5">
              <span className="text-sm font-semibold">By rep</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {['Rep', 'Cases', 'OT', 'MIA', 'At risk', 'Commission'].map((h, i) => (
                      <th
                        key={h}
                        className={`whitespace-nowrap border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${i === 0 ? 'text-left' : 'text-right'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.reps.map((r) => (
                    <tr key={r.closer} className="hover:bg-muted/40">
                      <td className="border-b border-border px-4 py-2 font-medium">{r.closer}</td>
                      <td className="border-b border-border px-4 py-2 text-right tabular-nums">{r.cases}</td>
                      <td className="border-b border-border px-4 py-2 text-right tabular-nums text-muted-foreground">{r.ot || '—'}</td>
                      <td className="border-b border-border px-4 py-2 text-right tabular-nums">{r.mia || '—'}</td>
                      <td className={`border-b border-border px-4 py-2 text-right tabular-nums ${r.atRisk ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {r.atRisk ? money(r.atRisk) : '—'}
                      </td>
                      <td className="border-b border-border px-4 py-2 text-right font-semibold tabular-nums">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Every case */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">
              Cases <span className="font-normal text-muted-foreground">({rows.length})</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-border">
                {([
                  ['all', 'All'],
                  ['ot', 'OT'],
                  ['mia', 'MIA'],
                  ['risk', 'At risk'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    aria-pressed={filter === key}
                    className={`px-2.5 py-1 text-xs font-medium ${filter === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <SearchBox value={query} onChange={setQuery} label="Search cases" placeholder="Name, rep, firm…" className="max-w-[220px]" />
            </div>
          </div>

          {loading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-11 animate-pulse bg-muted/40" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {query || filter !== 'all' ? 'Nothing matches that.' : 'No cases closed this month.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {(scope === 'mine'
                      ? ['Signed', 'Case', 'Firm', 'Invoice', 'Tier', 'Status', 'Commission']
                      : ['Signed', 'Case', 'Rep', 'Firm', 'Invoice', 'Tier', 'Status', 'Commission']
                    ).map((h) => (
                      <th
                        key={h}
                        className={`whitespace-nowrap border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${h === 'Commission' ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={`hover:bg-muted/40 ${r.isReplacement ? 'opacity-60' : ''}`}>
                      <td className="whitespace-nowrap border-b border-border px-4 py-2 tabular-nums text-muted-foreground">
                        {dayLabel(r.signedDay)}
                      </td>
                      <td className="max-w-[220px] truncate border-b border-border px-4 py-2 font-medium">
                        {r.name}
                        {r.isReplacement && <> <Pill tone="amber">replacement</Pill></>}
                      </td>
                      {scope === 'all' && (
                        <td className="border-b border-border px-4 py-2">{r.closer ?? <span className="text-muted-foreground">—</span>}</td>
                      )}
                      <td className="border-b border-border px-4 py-2 text-muted-foreground">{r.firm ?? '—'}</td>
                      <td className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{r.invoiceCode ?? '—'}</td>
                      <td className="border-b border-border px-4 py-2 text-muted-foreground">
                        {r.otClose ? <Pill tone="blue">OT</Pill> : r.tier ? `Tier ${r.tier}` : '—'}
                      </td>
                      <td className="border-b border-border px-4 py-2">
                        {r.mia ? (
                          /* The connect: straight to the card on the MIA
                             board, where the chase actually happens. */
                          <Link
                            href="/teams/mia"
                            title={
                              r.mia.reconnected
                                ? `${MIA_LABEL[r.mia.status] ?? r.mia.status}${r.mia.owner ? ` · ${r.mia.owner}` : ''} — open the MIA board`
                                : `Gone quiet${r.mia.owner ? `, ${r.mia.owner} chasing` : ', unclaimed'} — open the MIA board`
                            }
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <Pill tone={MIA_TONE[r.mia.status] ?? 'red'}>
                              {MIA_LABEL[r.mia.status] ?? r.mia.status}
                            </Pill>
                            <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="border-b border-border px-4 py-2 text-right font-semibold tabular-nums">
                        {r.commission === null
                          ? <span className="font-normal text-muted-foreground">—</span>
                          : money(r.commission)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && board && board.rows.length === 0 && (
          <EmptyState title="Nothing closed this month">
            Pick another month above, or check that cases are being stamped with a closer.
          </EmptyState>
        )}
      </PageBody>
    </>
  )
}
