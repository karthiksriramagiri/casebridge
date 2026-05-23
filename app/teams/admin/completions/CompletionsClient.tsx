'use client'

import { useState } from 'react'
import { format } from 'date-fns'

interface Answer {
  id: string
  attempt_id: string
  question_id: string
  selected_option_id: string
  questions: { question_text: string } | null
  options: { option_text: string; is_correct: boolean } | null
}

interface CompletionRow {
  id: string
  repName: string
  repEmail: string
  userId: string
  moduleTitle: string
  moduleId: string
  score: number
  passed: boolean
  attemptNumber: number
  isInvalidated: boolean
  createdAt: string
  tabLeaveCount: number
  contentViewSeconds: number
  answers: Answer[]
}

interface Props {
  rows: CompletionRow[]
}

export default function CompletionsClient({ rows }: Props) {
  const [search, setSearch] = useState('')
  const [breakdownAttempt, setBreakdownAttempt] = useState<CompletionRow | null>(null)

  const filtered = rows.filter((r) =>
    r.repName.toLowerCase().includes(search.toLowerCase()) ||
    r.moduleTitle.toLowerCase().includes(search.toLowerCase())
  )

  function exportCSV() {
    const header = ['Rep', 'Email', 'Module', 'Score', 'Result', 'Attempt #', 'Date']
    const csvRows = filtered.map((r) => [
      r.repName,
      r.repEmail || r.userId,
      r.moduleTitle,
      `${r.score}%`,
      r.passed ? 'Passed' : 'Failed',
      r.attemptNumber,
      format(new Date(r.createdAt), 'M/d/yyyy'),
    ])
    const csvContent = [header, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `completions_${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table controls */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <input
            type="text"
            placeholder="Search by rep name or module..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            <span>⬇</span> Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rep</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Module</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Result</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Attempt</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Content Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tab Leaves</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                    No completions found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const isRetake = row.attemptNumber > 1
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{row.repName}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{row.moduleTitle}</td>
                      <td className="px-4 py-3 text-gray-700">{row.score}%</td>
                      <td className="px-4 py-3">
                        {row.passed ? (
                          <span className="text-green-600 font-medium">Passed</span>
                        ) : (
                          <span className="text-red-500 font-medium">Failed</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isRetake ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-gray-600">#{row.attemptNumber}</span>
                            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-1.5 py-0.5 rounded uppercase">
                              Retake
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-600">#1</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {format(new Date(row.createdAt), 'M/d/yyyy')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {row.contentViewSeconds > 0 ? (
                          (() => {
                            const m = Math.floor(row.contentViewSeconds / 60)
                            const s = row.contentViewSeconds % 60
                            return m > 0 ? `${m}m ${s}s` : `${s}s`
                          })()
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.tabLeaveCount > 0 ? (
                          <span className="text-red-600 font-semibold">{row.tabLeaveCount}×</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setBreakdownAttempt(row)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors"
                        >
                          Breakdown
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Breakdown Modal */}
      {breakdownAttempt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Attempt Breakdown</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {breakdownAttempt.repName} · {breakdownAttempt.moduleTitle} · {breakdownAttempt.score}%
                </p>
              </div>
              <button
                onClick={() => setBreakdownAttempt(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {breakdownAttempt.answers.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No answer details available for this attempt.</p>
              ) : (
                <div className="space-y-3">
                  {breakdownAttempt.answers.map((answer, idx) => {
                    const isCorrect = answer.options?.is_correct === true
                    return (
                      <div
                        key={answer.id}
                        className={`rounded-lg border p-3 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`text-sm font-bold mt-0.5 ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                            {isCorrect ? '✓' : '✗'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">
                              Q{idx + 1}: {answer.questions?.question_text ?? 'Unknown question'}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              Answered: <span className={isCorrect ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                                {answer.options?.option_text ?? 'Unknown answer'}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setBreakdownAttempt(null)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
