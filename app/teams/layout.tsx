import type { ReactNode } from 'react'
import '../globals.css'
import './teams.css'
import NotificationBanner from './NotificationBanner'
import FridaySyncPopup from './FridaySyncPopup'
import CertificationPopup from './CertificationPopup'

/* ═══════════════════════════════════════════════════════════════════════════
   The Team Center's outermost layer.

   Deliberately thin. It brings in the palette and the three things that must
   be able to appear over any page — the announcement banner and the two
   popups — and nothing else.

   No `.tc-root` and no `bg-muted/40` here: this layout also wraps /teams
   (the public recruiting page), /teams/login and /teams/signup, which are
   not part of the center and must not be painted as though they were. The
   ground and the nav are applied by TeamsShell, one level in, where there is
   a signed-in account to draw a nav for.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function TeamsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NotificationBanner />
      <FridaySyncPopup />
      <CertificationPopup />
      {children}
    </>
  )
}
