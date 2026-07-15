'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Dot } from 'recharts'

interface DayScore {
  date: string
  dayScore: number
  events?: { id: string }[]
}

export default function ScoreChart({ dailyScores }: { dailyScores: DayScore[] }) {
  // Only show days that have actual events (no flat base-score padding)
  const data = [...dailyScores]
    .filter(d => d.events && d.events.length > 0)
    .reverse()
    .map(d => ({
      date: d.date,
      score: Number(d.dayScore),
      label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
    }))

  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 pt-4 pb-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Score History</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 5]}
            ticks={[0, 1, 2, 3, 4, 5]}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine y={2} stroke="#d1d5db" strokeDasharray="4 4" label={{ value: 'base', position: 'right', fontSize: 9, fill: '#9ca3af' }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '6px 10px' }}
            formatter={(v: number) => [v % 1 === 0 ? v : v.toFixed(2), 'Score']}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#0f1e3c"
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload } = props
              const color = payload.score > 2 ? '#16a34a' : payload.score < 2 ? '#ef4444' : '#6b7280'
              return <Dot key={payload.date} cx={cx} cy={cy} r={3} fill={color} stroke="white" strokeWidth={1.5} />
            }}
            activeDot={{ r: 5, stroke: '#0f1e3c', strokeWidth: 1.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
