# CaseBridge Dialer — Build Plan

**Status:** Pre-scaffolding. Awaiting owner sign-off before any code is written.
**Date drafted:** 2026-07-22

---

## Table of Contents

1. [What We're Building](#1-what-were-building)
2. [Architecture Overview](#2-architecture-overview)
3. [Deployment Constraint — Sub-Path on case-bridge.com](#3-deployment-constraint--sub-path-on-case-bridgecom)
4. [Data Model](#4-data-model)
5. [Core Subsystems](#5-core-subsystems)
6. [Build Slices and Test Gates](#6-build-slices-and-test-gates)
7. [MockProvider-First Development Strategy](#7-mockprovider-first-development-strategy)
8. [Compliance Rails — Non-Negotiable](#8-compliance-rails--non-negotiable)
9. [Open Questions](#9-open-questions)
10. [Environment Variables](#10-environment-variables)
11. [Recommended Next Steps](#11-recommended-next-steps)

---

## 1. What We're Building

A self-hosted **power + predictive dialer** for the CaseBridge personal injury intake desk. It replaces Convoso / PowerDialer.ai.

Core capabilities:
- Reps get a **browser softphone** (no desktop app, no physical phone required)
- Calls run inside **Twilio Conferences** — enables listen/whisper/barge without additional tooling
- Supervisors get a **live floor** showing every rep's state, every active call, queue depth, and real-time abandonment rate
- Leads sync bidirectionally with **GoHighLevel (GHL)** pipeline stages; dispositions write back as notes and custom field updates
- Dial engine supports **Preview, Power, and Predictive** modes with an abandonment governor hardcoded to the FCC 3% limit

---

## 2. Architecture Overview

### Monorepo Layout

```
dialer/                         ← repo root (see Q8 for mono vs. separate)
  apps/
    server/                     ← Fastify API + WebSocket gateway + dial engine
    web/                        ← React + Vite SPA (agent + admin views)
  packages/
    shared/                     ← TypeScript types, WS message contracts, Zod schemas
  deploy/
    caddy/                      ← Caddyfile sample
    nginx/                      ← nginx sample config
    fly.toml                    ← Fly.io deploy descriptor
  docker-compose.yml            ← local Postgres 15 + Redis 7
  .env.example
```

### Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20+ | Required for native WebSocket and modern `fetch` |
| Framework | Fastify | Lower overhead than Express; plugin ecosystem for auth, multipart |
| ORM | Prisma | Schema-first; migrations version-controlled |
| Database | Postgres 15 | See Q1 — separate instance vs. existing Supabase |
| Cache / Queue | Redis 7 | Per-campaign lead queues + pacing state |
| Frontend | React 18 + TypeScript + Vite | Tailwind for styling |
| SPA routing | React Router v6 | `basename="/dialer"` |
| Realtime | WebSockets (`ws` or socket.io) | Single gateway, channel-per-role |
| Telephony | Twilio Voice SDK (browser) + Twilio REST (server) | All calls are conferences |
| Package manager | pnpm workspaces | Shared types via `packages/shared` |

### Request Flow

```
Browser
  │
  ├── GET /dialer/*            → Vite static bundle (served by Fastify or CDN)
  ├── POST /dialer/api/*       → Fastify REST handlers
  ├── WS  /dialer/ws           → Fastify WebSocket gateway
  └── POST /dialer/api/webhooks/ghl       → GHL inbound events
      POST /dialer/api/webhooks/twilio/*  → Twilio StatusCallbacks
```

### Dial Engine Flow

```
Eligibility check (Redis queue pop)
  → calling hours gate (lead timezone, 8am–9pm local)
  → DNC check
  → attempts < max
  → originate via TelephonyProvider (Mock or Twilio)
      ├── MACHINE → voicemail drop, disposition MACHINE
      └── HUMAN   → bridge rep into conference
```

---

## 3. Deployment Constraint — Sub-Path on case-bridge.com

**This is the most architecturally significant constraint. Read carefully.**

### The Problem

The existing `case-bridge.com` site is a **Next.js app deployed on Vercel**. Vercel is a serverless/edge platform — it cannot host a persistent Node.js process. The dialer requires:

- A **long-running server process** (WebSocket connections, in-memory pacing state, the dial engine loop)
- A **persistent Redis connection**
- **Outbound TCP** to Twilio APIs
- The ability to receive **inbound webhooks** with consistent IPs

None of these are compatible with Vercel's serverless model.

### The Solution

Run the dialer on a **separate host** (Fly.io is the recommended default — see below) and **proxy `/dialer/*` from Vercel to that host**.

```
User browser
     │
     ▼
case-bridge.com  (Vercel)
     │
     │  vercel.json rewrite rule:
     │  /dialer/:path* → https://casebridge-dialer.fly.dev/:path*
     ▼
Fly.io / Railway / VPS
     └── Fastify process (dialer server)
```

### Required Vercel Change

Add to the existing site's `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/dialer/:path*",
      "destination": "https://casebridge-dialer.fly.dev/dialer/:path*"
    }
  ]
}
```

This must be done **before the dialer is usable from the main domain**. Until then, the dialer can be accessed directly on its own host URL for development and staging.

### Sub-Path Configuration Checklist

| Concern | Configuration |
|---|---|
| Vite build base | `base: '/dialer/'` in `vite.config.ts` |
| React Router | `<BrowserRouter basename="/dialer">` |
| All API routes | Prefixed `/dialer/api/*` |
| WebSocket path | `/dialer/ws` |
| GHL webhook URL | `https://case-bridge.com/dialer/api/webhooks/ghl` |
| Twilio callbacks | `https://case-bridge.com/dialer/api/webhooks/twilio/*` |
| Auth cookies | `path=/dialer; SameSite=Lax; Secure` |
| `BASE_URL` env var | Set to `https://case-bridge.com/dialer` in production |

### Host Recommendation: Fly.io

Fly.io is recommended over Railway or a bare VPS for the following reasons:

- Persistent VMs with WebSocket support out of the box
- Simple Docker-based deploy (`fly.toml` included in `deploy/`)
- Built-in managed Postgres and Redis add-ons (resolves Q1 and Q3 if separate instances are chosen)
- Free TLS, health checks, and auto-restart
- `fly secrets set` for environment variables — no `.env` files in production

If the team has a strong preference for Railway or a VPS, either works — the server code is host-agnostic.

---

## 4. Data Model

Managed via Prisma. All tables live in the dialer's own Postgres schema.

| Table | Purpose |
|---|---|
| `users` | Reps and admins; includes `role` (REP / SUPERVISOR / ADMIN) |
| `rep_states` | Current availability state per rep (OFFLINE / READY / ON_CALL / PAUSED / WRAPUP) |
| `campaigns` | Dial campaigns: mode, calling hours, max attempts, GHL stage mapping |
| `campaign_stage_map` | Maps GHL pipeline stage IDs to this campaign |
| `leads` | Contact records synced from GHL; includes timezone, DNC flag, attempt count |
| `calls` | Every dial attempt: lead, rep, direction, duration, AMD result, recording SID |
| `dispositions` | Outcome codes and their GHL writeback behavior |
| `caller_ids` | Pool of outbound numbers with daily count tracking and bench status |
| `dnc_list` | Do-not-call registry; checked on import, enqueue, and originate |
| `events` | Immutable audit log of every dial decision, state change, and webhook received |

---

## 5. Core Subsystems

### 5.1 GHL Integration

- **OAuth 2.0** authorization code flow; tokens stored per-location with auto-refresh
- **Webhook receiver** at `/dialer/api/webhooks/ghl` for opportunity stage changes
- **Reconciliation job** every 15 minutes to catch missed webhooks (polling GHL API)
- **After disposition**: write note to contact, update custom fields, move opportunity to mapped stage

### 5.2 Queue and Dial Engine

- Per-campaign Redis sorted sets; score = `(MAX_INT - priority) + timestamp` to get priority-first, FIFO ordering
- Eligibility gate before every pop: state is QUEUED, `next_eligible_at <= now`, inside calling hours for lead's timezone, not on DNC, attempts < max
- **Preview mode**: rep requests next lead manually, sees info before call is placed
- **Power mode**: dial-ahead ratio = 1.0 (one call per ready rep, no abandonment risk)
- **Predictive mode**: dial-ahead ratio R = `clamp(1.0, 3.0, computed_ratio)`; governor hard-stops new dials if rolling abandonment approaches 3%

### 5.3 Telephony (Twilio Conferences)

Every call — outbound, inbound, or manual — runs inside a named Twilio Conference (`call-{callId}`). This is what enables supervisor monitoring without bolt-on solutions.

- **Outbound**: originate to lead with AMD and recording → HUMAN: join rep into conference; MACHINE: voicemail drop → end conference
- **Inbound**: TwiML route to available rep's conference leg
- **Supervisor join**: add supervisor as conference participant with mute/coach flags
- **Dual-channel recording** via conference recording API

### 5.4 Caller ID Pool

- Pool of verified Twilio numbers tagged with area codes
- Selection algorithm: prefer area code matching lead's area code → fall back to pool rotation
- Daily cap per number (configurable); increment on originate, skip numbers at cap
- Bench/unbench via admin UI; benched numbers never selected

### 5.5 WebSocket Gateway

Single `/dialer/ws` endpoint with channel routing by role.

**Server → Client messages:**

| Message | When |
|---|---|
| `rep_state_changed` | Any rep's availability state changes |
| `call_ringing` | Outbound dial initiated |
| `call_connected` | Call bridged to rep |
| `call_ended` | Conference ended |
| `disposition_required` | Post-hangup; blocks rep until submitted |
| `queue_depth` | Emitted every 5s per campaign |
| `pacing_update` | Current dial ratio (predictive mode) |
| `abandonment_update` | Rolling abandonment % |
| `inbound_offer` | Inbound call routed to rep |
| `force_logout` | Supervisor-initiated |

**Client → Server messages:**

| Message | Action |
|---|---|
| `set_status` | Rep changes availability |
| `request_next` | Rep requests next lead (Preview mode) |
| `monitor_join` | Supervisor joins call as listener/whisper/barge |
| `manual_dial` | Rep dials a number directly |

---

## 6. Build Slices and Test Gates

Development proceeds in 10 sequential slices. Each slice has a concrete test gate — no slice is considered done until the gate passes.

---

### Slice 1 — Scaffold + Auth

**Scope:** pnpm monorepo structure, docker-compose (Postgres + Redis), Prisma schema and initial migration, Fastify server skeleton, JWT auth (login / refresh / logout), role-based route guards, seed script (1 admin, 2 reps, 1 campaign, 20 leads).

**Test gate:** Log in as ADMIN, REP, and SUPERVISOR in a browser. Confirm role-restricted routes return 403 for wrong roles. Confirm the Prisma schema migrates cleanly from scratch.

---

### Slice 2 — GHL OAuth + Webhook Ingest

**Scope:** GHL OAuth 2.0 flow and token storage, webhook receiver with signature verification, opportunity stage → lead upsert logic, 15-minute reconciliation cron job.

**Test gate:** Move a GHL opportunity from one stage to another in the GHL UI. Confirm the lead appears (or updates) in the dialer's `leads` table within 30 seconds. Manually delay the webhook; confirm the reconciliation job catches the discrepancy.

---

### Slice 3 — Queue Engine + MockProvider Power Dialing

**Scope:** Redis queue implementation, eligibility gate (calling hours, DNC, attempts), caller ID selection, dial engine loop (Power mode), MockProvider (configurable answer probability, AMD distribution, mid-call hangup simulation, StatusCallback sequencing), `events` table logging.

**Test gate:** Seed 50 leads. Run the dial engine in Power mode with MockProvider. All 50 leads reach a terminal state (ANSWERED, MACHINE, NO_ANSWER, or FAILED). Calling-hours enforcement unit tests pass. DNC unit tests pass. Every dial decision has a corresponding row in `events`.

---

### Slice 4 — Agent UI: Softphone Shell + Disposition Flow + GHL Writeback

**Scope:** `/agent` SPA view, campaign selector, status pill, current-call card (lead info, timer, mute/hold/hangup, DTMF pad), disposition screen (blocking modal on hangup), callback scheduler, left rail (next 5 in queue, today's dispositions), GHL writeback on disposition (note, custom fields, stage move).

**Test gate (MockProvider):** Rep logs in, selects a campaign, goes READY. Three calls ring through via MockProvider. Rep dispositions each call. Confirm GHL notes and stage updates appear in GHL for each corresponding contact. Disposition screen cannot be dismissed without submitting.

---

### Slice 5 — Supervisor Live Floor

**Scope:** `/admin` live floor view, rep state grid, active calls table with Listen/Whisper/Barge buttons (stubs until Slice 7), queue depth display, connect rate and abandonment rate widgets, assign lead to rep, force-logout action.

**Test gate:** Admin and two reps logged in simultaneously. Admin observes rep state changes on the live floor in under 1 second. Admin force-logouts a rep; rep's session ends immediately. Queue depth widget reflects actual Redis queue size.

---

### Slice 6 — Real Twilio Integration

**Scope:** TwilioProvider implementing the same interface as MockProvider, browser Twilio Voice SDK setup, TwiML App configuration, TwiML conference logic (outbound + inbound), Twilio access token endpoint, StatusCallback handlers, ngrok tunnel for local webhook development.

**Test gate:** Rep's browser registers with Twilio. A real outbound call to a test number connects. The rep hears audio and can speak. Call ends, disposition screen appears. Inbound call to the Twilio number routes to the rep's browser. All StatusCallback events are received and processed correctly.

---

### Slice 7 — Monitoring + Voicemail Drop

**Scope:** Supervisor listen/whisper/barge implemented as conference participant additions with appropriate mute flags, voicemail drop on AMD MACHINE result (play pre-recorded WAV, disconnect conference), manual dial input for reps, dual-channel conference recording.

**Test gate:** Three-way monitor test: rep on a call with a lead, supervisor joins as listener (hears both, neither hears supervisor), supervisor switches to whisper (rep hears supervisor, lead does not), supervisor barges (all three can hear each other). Voicemail drop: MockProvider (or Twilio AMD) returns MACHINE → voicemail plays → call ends → `calls` record shows `amd_result: MACHINE` and `voicemail_dropped: true`.

---

### Slice 8 — Predictive Pacing + Abandonment Governor

**Scope:** Pacing ratio computation (based on rolling connect rate and average handle time), R clamped to [1.0, 3.0], abandonment governor that hard-stops new dials when rolling abandonment approaches 3%, abandonment message playback (business name + callback number, FCC-compliant), `pacing_update` and `abandonment_update` WebSocket messages, always-visible abandonment % in admin UI.

**Test gate:** Simulation run: configure MockProvider with a low answer rate to stress the governor. Confirm abandonment rate never exceeds 3% over a 200-call run. Governor unit tests cover: governor engages at the correct threshold, ratio never exceeds 3.0, ratio never drops below 1.0, abandonment message plays on abandoned calls.

---

### Slice 9 — Caller ID Pool + Compliance Hardening

**Scope:** Caller ID pool admin UI (add/remove numbers, bench/unbench, view daily counts), area-code matching selection algorithm, daily cap enforcement, timezone enforcement tightened at the originate layer (second gate, in addition to queue pop gate), DNC import (CSV upload), DNC check at originate (third gate).

**Test gate:** Unit tests for caller ID selection (area code match, fallback rotation, skip benched, skip at daily cap). Unit tests for triple-gate DNC check (import, enqueue, originate). Unit tests for double-gate timezone enforcement (queue pop and originate). Integration test: import a CSV with 5 DNC numbers, confirm none are ever dialed even if manually added to a campaign queue.

---

### Slice 10 — Reports, Polish, and Production Hardening

**Scope:** Nightly rollup job writing to a `daily_stats` table (calls, connects, dispositions, abandonment rate per campaign), report pages in admin UI (daily stats table, charts), CSV export, error states and empty states for all UI views, loading skeletons, toast notifications, connection loss / reconnect handling for WebSocket, rate limiting on auth endpoints, structured JSON logging (pino), Fly.io production deploy, `deploy/` directory with Caddy and nginx sample configs.

**Test gate:** Run nightly rollup manually for a day with known mock call data. Confirm `daily_stats` numbers match raw `calls` table aggregates. CSV export downloads correctly. Disconnect the WebSocket mid-session; confirm the UI shows a reconnecting state and recovers. Production deploy on Fly.io responds correctly at `https://casebridge-dialer.fly.dev/dialer/`.

---

## 7. MockProvider-First Development Strategy

**No Twilio account or Twilio phone numbers are required until Slice 6.**

The `TelephonyProvider` interface is defined in `packages/shared` and has two implementations:

```
TelephonyProvider (interface)
  ├── MockProvider     ← used for Slices 1–5 and all unit/integration tests
  └── TwilioProvider   ← used from Slice 6 onward; toggled via TELEPHONY_PROVIDER env var
```

The MockProvider simulates:
- Configurable ringing delay before answer/no-answer
- Configurable answer probability (e.g., 40% answer rate)
- AMD result distribution (e.g., 60% HUMAN, 30% MACHINE, 10% NO_ANSWER)
- Mid-call hangups at random intervals
- StatusCallback event sequencing (initiated → ringing → answered → completed)

This means the entire dial engine, agent UI, disposition flow, supervisor floor, and GHL writeback can be built and tested without any live telephony credentials. The switch to TwilioProvider in Slice 6 is a configuration change, not a code change.

**TELEPHONY_PROVIDER=mock** in `.env` = MockProvider.
**TELEPHONY_PROVIDER=twilio** in `.env` = TwilioProvider.

All automated tests always run against MockProvider.

---

## 8. Compliance Rails — Non-Negotiable

These are not features to be prioritized — they are hard constraints. Any slice that would create a gap in compliance coverage must close that gap before the slice is considered done.

### FCC Abandonment Limit (≤ 3%)

- Rolling abandonment rate is computed continuously in the dial engine
- The governor **hard-stops new dials** when the rolling rate approaches 3% — it does not slow down, it stops
- The abandonment rate is **always visible** on the supervisor live floor and cannot be hidden or dismissed
- Every abandoned call plays an abandonment message that states the business name and a callback number (FCC requirement)
- Unit tests in Slice 8 must prove the governor holds the rate under 3% under adversarial conditions

### Calling Hours Enforcement (8am–9pm Lead-Local)

- Enforced at **two independent points**:
  1. When a lead is popped from the Redis queue (eligibility gate)
  2. At the moment of originate, immediately before the Twilio API call is made
- The lead's timezone is stored on the `leads` record and derived from their area code / ZIP on import if not explicitly set
- A lead with an unknown timezone is **never dialed** (fail safe, not fail open)
- Calling hours are configurable per campaign but the range cannot extend beyond 8am–9pm local

### DNC Enforcement (Triple Gate)

- DNC is checked at **three independent points**:
  1. On CSV import — any number matching the DNC list is flagged before it enters the `leads` table
  2. On enqueue — when a lead is added to a campaign's Redis queue
  3. On originate — immediately before the Twilio API call is made
- DNC additions are effective immediately: a number added to DNC while in-queue is caught at gate 3
- DNC import (CSV) is an admin UI feature in Slice 9 but the DNC table and originate gate are built in Slice 3

### Audit Logging

- Every dial decision — eligible, ineligible, DNC-blocked, hours-blocked, abandoned, etc. — is written to the `events` table
- Events are immutable (no update or delete). This is the legal record.

---

## 9. Open Questions

These must be answered before or during scaffolding. Decisions that affect the schema or deployment must be resolved before Slice 1 is considered done.

---

**Q1. Separate Postgres instance or reuse existing Supabase?**

The existing CaseBridge app uses Supabase. Options:
- **A) Same Supabase instance, separate schema** — simpler to manage, but couples the dialer's Prisma migrations to an existing production database. Risk: a bad migration can affect the existing app.
- **B) Separate Postgres instance** — fully isolated. Fly.io Postgres add-on makes this easy alongside the dialer deployment. Recommended for production safety.

*Decision needed from owner.*

---

**Q2. Where is the dialer hosted?**

Recommendation: **Fly.io**. Reasons: persistent VMs, native WebSocket support, managed Postgres + Redis add-ons, simple Docker deploy, reasonable pricing for a low-traffic internal tool.

Alternatives: Railway (simpler but fewer options), a bare VPS (more control, more maintenance).

*Decision needed from owner before deploy/ configs are written.*

---

**Q3. Redis — existing instance or provision new?**

If Fly.io is chosen, a Fly.io Redis (Upstash) add-on is the simplest path. If the team has an existing Redis instance (e.g., a Upstash instance used by the current site), it can be shared — but the dialer's queue keys should be namespaced (e.g., `dialer:queue:*`) to avoid collisions.

*Decision needed from owner.*

---

**Q4. GHL OAuth App — shared or new?**

The existing CaseBridge backend may already have a GHL marketplace app registered and connected to the target location. Options:
- **Reuse existing app** — requires adding the dialer's redirect URI and webhook URL to the existing app's configuration. The dialer would share the same GHL OAuth tokens.
- **Register a new app** — fully isolated, but requires going through GHL's app approval process again.

*Need to know: is there an existing GHL app registered, and does the current server-side integration use OAuth or a private integration key?*

---

**Q5. Twilio Phone Numbers**

No Twilio numbers are available yet (pending compliance / carrier approval). This is fine — MockProvider covers all development through Slice 5. However:

- A **Twilio account** with API credentials is needed by Slice 6 even if no numbers are purchased yet (the TwiML App and browser SDK work without purchased numbers for testing via Twilio test credentials)
- Purchased numbers are required before any real calls can be made
- The caller ID pool (Slice 9) assumes at least one verified number exists

*Action item: open Twilio account and obtain API credentials (SID, API Key) now. Number purchase can wait.*

---

**Q6. Vercel Rewrite Rule**

A rewrite rule must be added to the existing site's `vercel.json` to proxy `/dialer/*` to the dialer host. This requires:
- Knowing the final dialer host URL (resolves after Q2 is answered)
- Access to the existing CaseBridge Vercel project to merge the `vercel.json` change
- Verifying that Vercel's rewrite proxying supports WebSocket upgrades (it does for Pro plans; it does **not** for Hobby plans — confirm the Vercel plan)

*Action item: confirm Vercel plan level. If Hobby, WebSocket proxying will not work and the dialer must be accessed on a separate subdomain (e.g., `dialer.case-bridge.com`) with a DNS CNAME instead.*

---

**Q7. Shared Users or Separate User Table?**

Two options:
- **Separate user table** — dialer users are managed entirely within the dialer. Simpler to build, but reps have two logins (one for the main CaseBridge app, one for the dialer).
- **Shared auth** — the dialer delegates authentication to the existing CaseBridge auth system (e.g., Supabase Auth). More complex integration, but reps use a single login.

Given the dialer is a separate process on a separate host, a **separate user table with its own JWT auth** is recommended for Slice 1. A shared-auth integration can be layered on later if the team decides it's worth the complexity.

*Decision needed from owner.*

---

**Q8. Monorepo Location — Inside CaseBridge Repo or Separate?**

- **Option A: `/dialer` directory inside the existing CaseBridge repo** — one repo, easier to share types, but the existing repo's CI/CD pipeline needs to be updated to handle the monorepo structure. Risk of accidentally deploying dialer code via the existing Vercel pipeline.
- **Option B: Separate repo** — fully isolated. Cleaner CI/CD, no risk of cross-contamination. Recommended if the team uses branch-based Vercel previews.

*Recommendation: separate repo, at least for now. It can always be merged later.*

---

## 10. Environment Variables

All variables required for a production deployment. Local dev uses `.env`; production uses the host's secret manager (e.g., `fly secrets set`).

```bash
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Auth
JWT_SECRET=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_API_KEY_SID=
TWILIO_API_KEY_SECRET=
TWILIO_TWIML_APP_SID=

# Telephony mode — set to 'mock' until Slice 6
TELEPHONY_PROVIDER=mock

# GHL
GHL_CLIENT_ID=
GHL_CLIENT_SECRET=
GHL_LOCATION_ID=

# App
BASE_URL=https://case-bridge.com/dialer
NODE_ENV=production
```

---

## 11. Recommended Next Steps

In order. Do not start Slice 1 until steps 1–4 are complete.

1. **Owner reviews and signs off on this plan.** Flag any open questions with a decision.
2. **Resolve Q1 and Q2** (Postgres location and hosting platform) — these determine what goes in `docker-compose.yml` and `fly.toml`.
3. **Resolve Q7** (shared vs. separate users) — this determines the Prisma `users` schema in Slice 1.
4. **Resolve Q8** (monorepo location) — this determines where `git init` happens.
5. **Open a Twilio account and obtain API credentials** — needed by Slice 6 at the latest; getting credentials now means they can be in `.env.example` from day one.
6. **Confirm Vercel plan level** (Q6) — determines whether `/dialer` proxying works or whether a subdomain is needed.
7. **Begin Slice 1** with all resolved decisions baked in.

---

*This document is the source of truth for the dialer build. Update it as decisions are made and questions are resolved. Do not begin coding a slice until the previous slice's test gate has passed.*
