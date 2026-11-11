'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AssignmentDetailSheet } from '@/app/creative/_components/assignment-detail-sheet'
import { CreativeBoard } from '@/app/creative/_components/creative-board'
import { PageHeader, Pill, SearchBox } from '@/app/creative/_components/admin/shared'
import { useStore } from '@/app/creative/_lib/store'
import { isCreativeWork } from '@/app/creative/_lib/types'
import type { Assignment, AssignmentStatus } from '@/app/creative/_lib/types'

export default function CreativeAssignmentsPage() {
  const { assignments: allAssignments, setAssignmentStatus } = useStore()
  /* Relaunches are not something anyone makes, so they are not shown. */
  const assignments = useMemo(() => allAssignments.filter(isCreativeWork), [allAssignments])
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const needsWork = assignments.filter((a) => a.status === 'Assigned' || a.status === 'Feedback Done').length

  const changeStatus = (a: Assignment, status: AssignmentStatus) => {
    setAssignmentStatus(a.id, status, 'creative')
    if (status === 'Feedback Request') toast('Jason has been asked for feedback')
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="My Assignments"
        description="Open a card to read the brief, upload files and chat with Jason. You can move cards between In Process of Making and Feedback Request."
        actions={needsWork > 0 && <Pill tone="amber">{needsWork} waiting on you</Pill>}
      />
      <div className="flex flex-col gap-3 p-6">
        <SearchBox
          value={query}
          onChange={setQuery}
          label="Search my assignments"
          placeholder="Search title, type, firm, batch, hook"
        />
        <CreativeBoard query={query} onOpen={(a) => setOpenId(a.id)} onStatus={changeStatus} />
      </div>
      <AssignmentDetailSheet assignmentId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
