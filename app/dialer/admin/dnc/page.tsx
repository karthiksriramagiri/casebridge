'use client'

import { useState } from 'react'

export default function DNCPage() {
  const [number, setNumber] = useState('')
  const [list, setList] = useState<string[]>([])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">DNC List</h1>
        <p className="text-sm text-gray-500 mt-0.5">Do-not-call registry</p>
      </div>
      <div className="flex gap-2 max-w-sm">
        <input
          value={number}
          onChange={e => setNumber(e.target.value)}
          placeholder="+1 (555) 000-0000"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <button
          onClick={() => { if (number.trim()) { setList(l => [number.trim(), ...l]); setNumber('') } }}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500">
          Add
        </button>
      </div>
      {list.length > 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden max-w-sm">
          {list.map((n, i) => (
            <div key={i} className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-2.5 last:border-0 dark:border-gray-800 dark:bg-gray-900">
              <span className="font-mono text-sm text-gray-800 dark:text-gray-200">{n}</span>
              <button onClick={() => setList(l => l.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:text-red-400">Remove</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No numbers added yet.</p>
      )}
    </div>
  )
}
