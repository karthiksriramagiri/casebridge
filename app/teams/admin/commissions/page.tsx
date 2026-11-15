'use client'

import { CommissionBoard } from '@/app/teams/_components/commission-board'

/* The whole floor's commissions. The board itself is shared with the rep's
   own page — same component, same endpoint, so the number a rep sees and
   the number their manager sees cannot disagree. */
export default function AdminCommissionsPage() {
  return <CommissionBoard scope="all" />
}
