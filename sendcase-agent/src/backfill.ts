// One-time (or repeatable) sweep over every case currently sitting in a
// Pending Send stage. Safe to re-run: cases already marked completed are
// skipped, so a rerun costs one GHL read per already-done case instead of a
// full agent run.

import { findPendingSendCases, hasPSTag, getContact } from './ghl.js'
import { alreadyCompleted } from './store.js'
import { runAgent } from './agent.js'
import { enqueue } from './queue.js'

export interface BackfillReport {
  found: number
  queued: number
  skippedCompleted: number
  skippedNoTag: number
}

export async function backfill(opts: { requireTag?: boolean } = {}): Promise<BackfillReport> {
  const requireTag = opts.requireTag ?? false
  const cases = await findPendingSendCases()

  const report: BackfillReport = {
    found: cases.length,
    queued: 0,
    skippedCompleted: 0,
    skippedNoTag: 0,
  }

  for (const c of cases) {
    if (await alreadyCompleted(c.contactId)) {
      report.skippedCompleted++
      continue
    }

    // The stage is the trigger by default. Requiring the tag as well costs one
    // extra GHL read per case, so it is opt-in.
    if (requireTag) {
      const contact = await getContact(c.contactId)
      if (!hasPSTag(contact)) {
        report.skippedNoTag++
        continue
      }
    }

    const added = enqueue(c.contactId, async () => {
      console.log(`[backfill] running ${c.contactId} (${c.contactName ?? 'unnamed'})`)
      await runAgent({
        contactId: c.contactId,
        contactName: c.contactName,
        firm: c.firm,
      })
    })
    if (added) report.queued++
  }

  console.log('[backfill]', report)
  return report
}
