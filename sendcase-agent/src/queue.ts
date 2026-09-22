// A serial queue. Cases are processed one at a time on purpose: concurrent
// runs would multiply GHL calls against a quota this service shares with the
// dialer, and nothing here is latency-sensitive — a reviewer reads the results
// later.

type Job = { contactId: string; run: () => Promise<void> }

const pending: Job[] = []
const queued = new Set<string>()
let draining = false

export function queueDepth(): number {
  return pending.length
}

export function isQueued(contactId: string): boolean {
  return queued.has(contactId)
}

export function enqueue(contactId: string, run: () => Promise<void>): boolean {
  if (queued.has(contactId)) return false
  queued.add(contactId)
  pending.push({ contactId, run })
  void drain()
  return true
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (pending.length) {
      const job = pending.shift()!
      try {
        await job.run()
      } catch (err) {
        console.error(`[queue] job for ${job.contactId} threw`, err)
      } finally {
        queued.delete(job.contactId)
      }
    }
  } finally {
    draining = false
  }
}
