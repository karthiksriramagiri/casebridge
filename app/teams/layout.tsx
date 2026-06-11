import type { ReactNode } from 'react'
import '../globals.css'
import CommissionNotice from './CommissionNotice'
import FridaySyncPopup from './FridaySyncPopup'

export default function TeamsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <CommissionNotice />
      <FridaySyncPopup />
      {children}
    </div>
  )
}
