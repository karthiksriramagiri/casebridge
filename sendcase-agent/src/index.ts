import express from 'express'

import { runAgent } from './agent.js'
import { backfill } from './backfill.js'
import { enqueue, queueDepth, isQueued } from './queue.js'
import { getContact, hasPSTag, callsSpentToday, GhlBudgetError, GhlQuotaError } from './ghl.js'
import { notifyError } from './slack.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = Number(process.env.PORT ?? 3000)
const SECRET = (process.env.AGENT_SECRET ?? '').trim()

function authorized(req: express.Request): boolean {
  if (!SECRET) return true // no secret configured — open, for local dev only
  const header = req.header('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  return bearer === SECRET || req.header('x-agent-secret') === SECRET
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    queueDepth: queueDepth(),
    ghlCallsToday: callsSpentToday(),
  })
})

// GHL workflow → Webhook action posts here when the -ps tag lands on a contact.
app.post('/webhooks/ghl/pending-send', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' })

  const body = req.body ?? {}
  const contactId: string | undefined =
    body.contactId ?? body.contact_id ?? body.contact?.id ?? body.id
  if (!contactId) {
    return res.status(400).json({ error: 'no contactId in payload', received: Object.keys(body) })
  }

  if (isQueued(contactId)) {
    return res.json({ ok: true, status: 'already queued', contactId })
  }

  // Acknowledge fast — GHL webhooks time out, and the run takes a while.
  res.json({ ok: true, status: 'queued', contactId })

  enqueue(contactId, async () => {
    try {
      const contact = await getContact(contactId)

      // Verify the trigger rather than trusting the payload: tags get removed,
      // workflows get fired by hand, and a stale webhook shouldn't spend an
      // agent run.
      if (process.env.REQUIRE_PS_TAG !== '0' && !hasPSTag(contact)) {
        console.log(`[webhook] ${contactId} no longer carries the PS tag; skipping`)
        return
      }

      const name =
        contact?.contactName ??
        [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') ??
        null

      const result = await runAgent({ contactId, contactName: name })
      console.log(`[webhook] ${contactId} → ${result.status}`, {
        written: Object.keys(result.written).length,
        iterations: result.iterations,
      })
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      console.error(`[webhook] ${contactId} failed:`, msg)
      if (err instanceof GhlBudgetError || err instanceof GhlQuotaError) {
        await notifyError(contactId, null, msg)
      }
    }
  })
})

// Sweep everything already sitting in Pending Send.
app.post('/backfill', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' })
  try {
    const report = await backfill({ requireTag: req.body?.requireTag === true })
    res.json({ ok: true, ...report })
  } catch (err: any) {
    // A quota refusal is a 429, not a 500 — reporting it as a server error
    // hides the one fact that explains the failure.
    const status =
      err instanceof GhlBudgetError ? 429
      : err instanceof GhlQuotaError ? (err.status === 429 ? 429 : 502)
      : 500
    res.status(status).json({
      error: err?.message ?? String(err),
      ...(err instanceof GhlQuotaError
        ? {
            dailyRemaining: err.dailyRemaining,
            resetInSeconds: err.resetMs ? Math.round(Number(err.resetMs) / 1000) : null,
          }
        : {}),
    })
  }
})

// Run one case by hand — for testing and for the Run button.
app.post('/run/:contactId', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' })
  const { contactId } = req.params
  try {
    const result = await runAgent({ contactId })
    res.json({ ok: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) })
  }
})

app.listen(PORT, () => {
  console.log(`[sendcase-agent] listening on :${PORT}`)
  console.log(`[sendcase-agent] model=${process.env.CLAUDE_MODEL ?? 'claude-opus-5'}`)
  if (!SECRET) console.warn('[sendcase-agent] AGENT_SECRET unset — endpoints are unauthenticated')
})
