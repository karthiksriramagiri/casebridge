'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { money, compact, num } from '@/app/_metrics/dash'

/* ═══════════════════════════════════════════════════════════════════════════
   Money in, money out — one bar pair per month.

   Two series in the same unit (dollars) share one axis; a second y-scale would
   make the gap between them meaningless. Revenue carries the accent and cost
   stays neutral ink, which is this system's only accent plus its ink ramp —
   a second hue would break the single-accent rule for no gain, and the pair
   already separates at ΔE 18.7 under protanopia. Identity is never carried by
   color alone: the legend, the fixed left/right order inside each pair and the
   hover card all name the series.

   Net profit is not a third bar — it is the gap between the two, so it is
   direct-labelled under the axis where the eye already is.
   ═══════════════════════════════════════════════════════════════════════════ */

export type PnlMonth = {
  month: string
  revenue: number
  adSpend: number
  ops: number
  salary: number
  repPay: number
  sanguine: number
  totalCost: number
  netProfit: number
  cases: number
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(key: string) {
  return MONTH_NAMES[Number(key.slice(5, 7)) - 1] || key
}

/** Round the top of the scale up to a round number, finely enough that the
 *  tallest bar still fills most of the plot — snapping 270k up to 500k would
 *  leave the chart looking half empty. */
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
function niceCeil(v: number) {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  return (NICE_STEPS.find(s => n <= s) ?? 10) * pow
}

export function PnlChart({ months }: { months: PnlMonth[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(760)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const cw = entries[0]?.contentRect.width
      if (cw && cw > 0) setW(cw)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 208
  const PAD_L = 54
  const PAD_R = 6
  const plotW = Math.max(120, w - PAD_L - PAD_R)
  const n = months.length || 1

  const peak = Math.max(1, ...months.map(m => Math.max(m.revenue, m.totalCost)))
  const top = niceCeil(peak * 1.08)
  const y = (v: number) => H - (v / top) * H

  /* Few months should not mean skinny bars marooned in white space: the pair
     grows to fill its slot and only stops where a bar would read as a block. */
  const groupW = plotW / n
  const barW = Math.max(3, Math.min(54, groupW / 2 - 6))
  const showNet = groupW >= 46

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * top)
  const active = hover != null ? months[hover] : null

  function pick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - rect.left - PAD_L) / groupW)
    setHover(i >= 0 && i < months.length ? i : null)
  }

  return (
    <div className="mx-pnl" ref={wrapRef}>
      <div className="mx-pnl-plot" onMouseMove={pick} onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H + 34} viewBox={`0 0 ${w} ${H + 34}`} className="mx-pnl-svg"
          role="img"
          aria-label={`Revenue and cost by month. ${months.map(m => `${monthLabel(m.month)}: revenue ${money(m.revenue)}, cost ${money(m.totalCost)}`).join('. ')}`}>

          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD_L} y1={y(t)} x2={w - PAD_R} y2={y(t)}
                stroke={t === 0 ? 'var(--mx-line)' : 'var(--mx-line-2)'} strokeWidth={1} />
              <text x={PAD_L - 10} y={y(t) + 3.5} textAnchor="end" className="mx-pnl-tick">
                {t === 0 ? '0' : `$${compact(t)}`}
              </text>
            </g>
          ))}

          {months.map((m, i) => {
            const cx = PAD_L + i * groupW + groupW / 2
            const revH = Math.max(m.revenue > 0 ? 2 : 0, H - y(m.revenue))
            const costH = Math.max(m.totalCost > 0 ? 2 : 0, H - y(m.totalCost))
            const dim = hover != null && hover !== i
            return (
              <g key={m.month} opacity={dim ? 0.38 : 1}>
                {hover === i && (
                  <rect x={PAD_L + i * groupW} y={0} width={groupW} height={H}
                    fill="var(--mx-surface-3)" opacity={0.7} />
                )}
                {/* 2px surface gap between the pair keeps the two fills from
                    touching and reading as one stacked bar. */}
                <rect x={cx - barW - 1} y={H - revH} width={barW} height={revH} rx={4}
                  fill="var(--mx-accent)" />
                <rect x={cx + 1} y={H - costH} width={barW} height={costH} rx={4}
                  fill="var(--mx-ink-2)" />
                <text x={cx} y={H + 15} textAnchor="middle"
                  className={`mx-pnl-month ${hover === i ? 'on' : ''}`}>
                  {monthLabel(m.month)}
                </text>
                {showNet && (
                  <text x={cx} y={H + 29} textAnchor="middle"
                    className="mx-pnl-net"
                    fill={m.netProfit >= 0 ? 'var(--mx-good)' : 'var(--mx-crit)'}>
                    {m.netProfit < 0 ? '−' : '+'}${compact(Math.round(Math.abs(m.netProfit)))}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {active && (
          <div className="mx-pnl-tip"
            style={{
              left: Math.min(Math.max(PAD_L + (hover! + 0.5) * groupW, 92), w - 92),
              transform: 'translateX(-50%)',
            }}>
            <div className="mx-pnl-tip-head">
              {monthLabel(active.month)} {active.month.slice(0, 4)}
              <span>{num(active.cases)} {active.cases === 1 ? 'case' : 'cases'}</span>
            </div>
            <TipRow label="Revenue" value={money(active.revenue)} swatch="var(--mx-accent)" />
            <TipRow label="Total cost" value={money(active.totalCost)} swatch="var(--mx-ink-2)" />
            <div className="mx-pnl-tip-sub">
              <span>Ads {money(active.adSpend)}</span>
              <span>Sanguine {money(active.sanguine)}</span>
              <span>Ops {money(active.ops)}</span>
              <span>Payroll {money(active.repPay + active.salary)}</span>
            </div>
            <div className="mx-pnl-tip-net">
              <span>Net profit</span>
              <b style={{ color: active.netProfit >= 0 ? 'var(--mx-good)' : 'var(--mx-crit)' }}>
                {active.netProfit < 0 ? `−${money(Math.abs(active.netProfit))}` : money(active.netProfit)}
              </b>
            </div>
          </div>
        )}
      </div>

      <div className="mx-pnl-key">
        <span className="mx-comp-key-item">
          <span className="mx-comp-swatch" style={{ background: 'var(--mx-accent)' }} /> Revenue
        </span>
        <span className="mx-comp-key-item">
          <span className="mx-comp-swatch" style={{ background: 'var(--mx-ink-2)' }} /> Total cost
        </span>
        {showNet && <span className="mx-pnl-key-note">Net profit printed under each month</span>}
      </div>
    </div>
  )
}

function TipRow({ label, value, swatch }: { label: string; value: string; swatch: string }) {
  return (
    <div className="mx-pnl-tip-row">
      <span className="mx-comp-swatch" style={{ background: swatch }} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}
