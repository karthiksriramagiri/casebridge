'use client'
import { useState, useEffect } from 'react'

interface ModuleStub {
  id: string
  title: string
}

const STORAGE_KEY = 'acknowledged_module_ids'

export default function NewModulePopup({ modules }: { modules: ModuleStub[] }) {
  const [newModules, setNewModules] = useState<ModuleStub[]>([])
  const [show, setShow] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw === null) {
      // First visit — silently acknowledge everything, no popup
      localStorage.setItem(STORAGE_KEY, JSON.stringify(modules.map((m) => m.id)))
      return
    }

    const acknowledged: string[] = JSON.parse(raw)
    const fresh = modules.filter((m) => !acknowledged.includes(m.id))

    if (fresh.length > 0) {
      setNewModules(fresh)
      setShow(true)
    }
  }, [modules])

  function dismiss() {
    // Mark all current modules as acknowledged
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modules.map((m) => m.id)))
    setShow(false)
  }

  if (!show || newModules.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-[#0f1e3c] px-7 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-full bg-blue-500/30 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider">Training Update</p>
              <h2 className="text-white text-xl font-bold">
                New {newModules.length === 1 ? 'Module' : 'Modules'} Added
              </h2>
            </div>
          </div>
          <p className="text-blue-200 text-sm mt-2 ml-12">
            {newModules.length === 1
              ? 'A new training module has been added to your curriculum.'
              : `${newModules.length} new training modules have been added to your curriculum.`}
          </p>
        </div>

        {/* Body */}
        <div className="px-7 py-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            {newModules.length === 1 ? 'New Module' : 'New Modules'}
          </p>
          <div className="space-y-2 mb-6">
            {newModules.map((m) => (
              <div key={m.id} className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <p className="text-sm font-semibold text-gray-800">{m.title}</p>
              </div>
            ))}
          </div>

          <button
            onClick={dismiss}
            className="w-full bg-[#0f1e3c] hover:bg-[#1a3060] text-white font-bold text-sm py-3 rounded-xl transition-colors"
          >
            Got it, let&apos;s go
          </button>
        </div>
      </div>
    </div>
  )
}
