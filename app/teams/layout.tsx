import type { ReactNode } from 'react'
import '../globals.css'
import NotificationBanner from './NotificationBanner'
import FridaySyncPopup from './FridaySyncPopup'
import CertificationPopup from './CertificationPopup'

export default function TeamsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <NotificationBanner />
      <FridaySyncPopup />
      <CertificationPopup />
      {children}
    </div>
  )
}
