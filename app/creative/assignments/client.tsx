'use client'

import { MetricsHeader } from '@/app/_metrics/chrome'
import { AssignmentsBoard } from './board'
import './board.css'

export function AssignmentsClient() {
  return (
    <>
      <MetricsHeader />
      <main className="mx-main">
        <AssignmentsBoard />
      </main>
    </>
  )
}
