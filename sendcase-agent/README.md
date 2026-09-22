# sendcase-agent

An agent that fills a client's intake fields when their case reaches **Pending Send**,
then tells you it's ready for review. It never sends anything to the firm.

## Why an agent and not one extraction call

Evidence differs per case: one has three call transcripts and no texts, the next has a
long SMS thread and a photo of the police report. The agent reads what it needs until it
can fill the fields, instead of every case paying to pull every source. It works cheap
sources first — SMS history and call transcripts come from our own Supabase, costing no
GHL quota — and only reaches into GHL's conversation threads when fields are still blank.

## Flow

```
GHL: -ps tag added to contact
        │  (Workflow → Webhook action)
        ▼
POST /webhooks/ghl/pending-send   { contactId }
        │  re-verifies the tag, then queues the case (serial)
        ▼
Agent loop (Tool Runner, claude-opus-5, adaptive thinking)
  read_contact ──────── what's already filled, what's still blank
  read_sms_history ──── Supabase, free
  read_call_transcripts ─ Supabase, free
  read_ghl_conversations ─ GHL, costs quota, only if needed
  read_notes ────────── GHL, costs quota
        ▼
  save_intake (called once)
        ├─ writes only fields that were blank — never overwrites a human's value
        ├─ adds a summary note on the contact
        ├─ upserts intake_fill_jobs  →  /sendcase page updates itself
        └─ Slack: "Intake ready for review" + link
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness, queue depth, GHL calls spent today |
| POST | `/webhooks/ghl/pending-send` | GHL workflow target; body needs a contact id |
| POST | `/backfill` | Sweep every case currently in a Pending Send stage. `{"requireTag":true}` also checks the tag (one extra GHL read per case) |
| POST | `/run/:contactId` | Run one case synchronously — for testing |

All except `/health` require `Authorization: Bearer $AGENT_SECRET`.

## Quota discipline

Everything GHL goes through `src/ghl.ts`, which enforces a burst limiter, a self-imposed
daily ceiling (`GHL_DAILY_BUDGET`), and a reserve floor (`GHL_RESERVE_FLOOR`) below which
it refuses to run so the dialer keeps working. Pipeline schemas are cached for an hour.

It also never turns a refusal into empty data. Returning `[]` on a 429 is what made
`/sendcase` and the dialer's leads page look empty for a full day while the real problem
was an exhausted quota.

## Deploying to Railway

1. `railway init` in this directory (or point a Railway service at this subdirectory —
   set **Root Directory** to `sendcase-agent`).
2. Add every variable from `.env.example`.
3. Deploy. Nixpacks runs `npm ci && npm run build`, starts `npm start`, health-checks `/health`.
4. Copy the service's public URL.
5. In GHL: **Automation → Workflows → new workflow**, trigger *Contact Tag Added* = `-ps`,
   action *Webhook* → `POST https://<railway-url>/webhooks/ghl/pending-send`, with header
   `Authorization: Bearer <AGENT_SECRET>` and the contact id in the body.
6. Clear the existing pile once:
   ```
   curl -X POST https://<railway-url>/backfill -H "Authorization: Bearer $AGENT_SECRET"
   ```

## Keeping fields in sync

`src/fields.ts` was generated from `app/dialer/_lib/ghl-fields.ts` in the CaseBridge repo.
If field IDs change in GHL, update both.
