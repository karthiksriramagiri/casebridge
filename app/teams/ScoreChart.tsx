'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Dot } from 'recharts'

/* Recharts paints SVG attributes, not classes, so it cannot read the center's
   tokens the way the rest of the page does. These are the same palette as
   teams.css, as the literal values those tokens resolve to — kept together
   and named so the chart cannot drift from the page around it without someone
   editing this block on purpose. */
const CHART = {
  grid: '#eef0f4',        /* --muted */
  axis: '#5f636a',        /* --muted-foreground */
  base: '#dcdee2',        /* --border */
  line: '#1874ed',        /* --primary */
  good: '#25984d',        /* --success */
  bad: '#df2225',         /* --destructive */
  flat: '#5f636a',        /* --muted-foreground */
  card: '#ffffff',        /* --card */
} as const

interface DayScore {
  date: string
  dayScore: number
  events?: { id: string }[]
}

export default function ScoreChart({ dailyScores }: { dailyScores: DayScore[] }) {
  // Only days that have actual events — no flat base-score padding, which
  // would draw a confident line through days nobody worked.
  const data = [...dailyScores]
    .filter((d) => d.events && d.events.length > 0)
    .reverse()
    .map((d) => ({
      date: d.date,
      score: Number(d.dayScore),
      label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
    }))

  if (data.length === 0) return null

  return (
    <div className="rounded-lg border bg-card px-5 pb-2 pt-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Score history
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: CHART.axis }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 5]}
            ticks={[0, 1, 2, 3, 4, 5]}
            tick={{ fontSize: 10, fill: CHART.axis }}
            tickLine={false}
            axisLine={false}
          />
          {/* Two is the base score: above it is a good day, below it is not. */}
          <ReferenceLine
            y={2}
            stroke={CHART.base}
            strokeDasharray="4 4"
            label={{ value: 'base', position: 'right', fontSize: 9, fill: CHART.axis }}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: `1px solid ${CHART.base}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              padding: '6px 10px',
            }}
            formatter={(v: number) => [v % 1 === 0 ? v : v.toFixed(2), 'Score']}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={CHART.line}
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload } = props
              const color =
                payload.score > 2 ? CHART.good : payload.score < 2 ? CHART.bad : CHART.flat
              return (
                <Dot key={payload.date} cx={cx} cy={cy} r={3} fill={color} stroke={CHART.card} strokeWidth={1.5} />
              )
            }}
            activeDot={{ r: 5, stroke: CHART.line, strokeWidth: 1.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
