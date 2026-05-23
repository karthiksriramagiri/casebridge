import type { ReactNode } from 'react'
import '../globals.css'

export default function TeamsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
