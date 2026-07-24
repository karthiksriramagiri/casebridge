# CaseBridge Dialer — Project Documentation

## What We're Building

CaseBridge Dialer is an internal call center platform for personal injury law firms (Larry H. Parker and Fears Law). It replaces fragmented tools (GHL calls, separate SMS, no monitoring) with a single workspace where reps dial leads, handle SMS, and supervisors monitor calls in real time.

**The core problem it solves:** Intake reps need to work a high-volume lead queue efficiently. Supervisors need visibility into what's happening on the floor. Every interaction — calls, texts, dispositions — needs to feed into a case history that helps reps and attorneys understand a lead's situation at a glance.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Voice | Twilio Voice SDK + Twilio Conferences |
| SMS | Twilio Messaging |
| Transcription | Deepgram Nova-2 (multichannel, async) |
| AI Summaries | Claude Haiku (`claude-haiku-4-5-20251001`) |
| Lead CRM | GoHighLevel (GHL) v2 API |
| Hosting | Vercel |

---

## GHL Integration

Two pipelines are connected:

| Firm | Pipeline ID | Slug |
|---|---|---|
| Larry H. Parker | `yMqNixSnChC5lcGQXA1g` | `lhp` |
| Fears Law | `Jj4DCdu5duYDgI87ERbx` | `fears` |

Location ID: `AGAoUCwWTwc4Bqslwt9r`

GHL is the source of truth for:
- Lead/opportunity data (name, phone, email, tags, custom fields)
- Pipeline stages (mapped as dialer campaigns)
- Contact tags (synced in real-time from tag editor)
- Contact custom fields (shown in lead detail panel)

---

## Rep Team

| Identity (Twilio) | Name |
|---|---|
| `karthik` | Karthik |
| `pablo` | Pablo |
| `ziyad` | Ziyad |
| `mauricio` | Mauricio |

---

## Application Structure

```
app/dialer/
├── layout.tsx                  # Wraps all dialer pages
├── page.tsx                    # Redirects → /dialer/agent
├── _types.ts                   # Shared types + dispositions
├── _context/
│   ├── call.tsx                # Twilio Device + call state (layout-level)
│   └── theme.tsx               # Light/dark mode
├── _components/
│   ├── DialerNav.tsx           # Sidebar navigation
│   ├── FloatingCallBar.tsx     # Persistent call bar (non-agent pages)
│   └── StatusPill.tsx          # Rep status badge
├── agent/page.tsx              # Main rep workspace
├── leads/page.tsx              # Lead history + transcripts
├── messages/page.tsx           # SMS conversations
└── admin/
    ├── page.tsx                # Live Floor (supervisor)
    ├── campaigns/page.tsx      # Campaign overview
    ├── caller-ids/page.tsx     # Caller ID management (stub)
    ├── dnc/page.tsx            # Do Not Call list (stub)
    └── reports/page.tsx        # Reports (stub)
```

---

## Pages

### `/dialer/agent` — Rep Workspace

The primary tool reps use all day. Three-column layout:

**Left rail**
- Campaign selector (GHL pipeline stage)
- Lead queue (up to 100 leads, auto-loads)
- Disposition history for today's calls

**Center**
- Rep status (OFFLINE / READY / PAUSED / ON_CALL / WRAPUP)
- Softphone card — ringing/connected/wrapup states
- Call controls: Mute, Hold, DTMF pad, Hang Up
- AI Case Summary card (visible at a glance during the call)
- Manual dial input
- "Call Next" button

**Right rail**
- Lead detail (name, phone, email, source, country, timezone, added date)
- Tag editor (syncs to GHL in real-time)
- AI Case Summary (bullet points from Claude)
- Notes textarea

**Disposition modal** (appears after call ends)
- 10 disposition options (Qualified, Not Qualified, Callback, No Answer, Voicemail Left, Not Interested, Wrong Number, Do Not Call, Appointment Set, Attorney Review)
- Callback datetime picker (when Callback is selected)
- "Submit & Next" → dispositions and auto-dials the next lead
- "Stop Queue" → dispositions and stops auto-dialing

### `/dialer/leads` — Lead History

Browse all leads who have been called. Organized by firm and campaign.

- Left: Firm/campaign tree navigation
- Center: Lead list with search, load more
- Right: Lead detail panel
  - KPI cards (total calls, connected, talk time, transcripts)
  - AI Case Summary (always visible, placeholder if no calls yet)
  - GHL custom fields (case info)
  - Call history with recording playback
  - Transcript viewer with speaker-labeled utterances

### `/dialer/messages` — SMS Conversations

Centralized SMS hub using Twilio directly (not GHL messaging).

- Left: All conversations (leads who've been called OR texted)
  - Unread badge, firm badge, last message preview
  - Leads with no messages shown as "No messages yet"
- Right: Message thread
  - Inbound/outbound direction indicators
  - Media attachment support
  - Auto-polls every 10 seconds
- New conversation: Search GHL contacts by name/phone (only known leads)

### `/dialer/admin` — Live Floor (Supervisor)

Real-time monitoring dashboard. Polls every 5 seconds.

**KPI strip**
- On Call Now
- Active Reps
- Dials Today
- Connect Rate (avg across all reps)

**Rep overview table**
- Status, current lead, firm, dials, connected, connect %, avg duration

**Rep cards**
- Live call timer (ticking)
- Lead name + firm currently being called
- Color-coded connect rate (green ≥30%, amber ≥15%, gray otherwise)
- Monitor buttons: **Listen** / **Whisper** / **Barge** (only when rep is ON_CALL)

---

## Call Flow (End to End)

```
Rep clicks "Call Next" on agent page
    ↓
POST /api/dialer/call/start
    - Creates Twilio conference: conf-{identity}-{timestamp}
    - Dials customer into conference via REST API (label: 'customer')
    - Status callback URL includes ContactId, RepIdentity, Firm, etc. as query params
    - Stores session in dialer_active_sessions
    - Returns { confName, customerCallSid }
    ↓
Browser: device.connect({ ConferenceName: confName, Mode: 'rep' })
    ↓
Twilio calls POST /api/dialer/twiml/voice
    - Returns <Conference name=confName startConferenceOnEnter=true endConferenceOnExit=true
               statusCallback=/conference-status statusCallbackEvent='start end join leave'>
    ↓
/api/dialer/twiml/conference-status fires:

  conference-start event:
    - Updates dialer_active_sessions with conference_sid
    - Updates dialer_calls (by customer_call_sid) with conference_sid
    - Starts dual-channel recording via REST API (recordingChannels: 2)

  participant-join (rep, label != 'customer'):
    - Stores rep_call_sid in active session + dialer_calls

  conference-end:
    - Deletes active session (Live Floor updates within 5s)

    ↓
/api/dialer/twiml/status fires (customer's call):
    - Reads ContactId/RepIdentity etc from URL query params
    - Upserts dialer_calls row with full metadata

    ↓
Call ends → Rep hangup or customer hangs up

    ↓
Twilio sends recording to POST /api/dialer/twiml/recording:
    - ConferenceSid → looks up dialer_calls by conference_sid
    - Stores recording_url and recording_sid
    - POSTs audio URL to Deepgram (async job, multichannel=true)

    ↓
Deepgram finishes → POST /api/dialer/twiml/transcript-callback:
    - Parses multichannel utterances (channel 0=customer, channel 1=rep)
    - Stores full_text + utterances + Deepgram summary in dialer_transcripts
    - Triggers generateAISummary(contactId) — non-blocking

    ↓
Claude Haiku (generateAISummary):
    - Fetches GHL contact fields + all transcripts + all SMS in parallel
    - Generates bullet-point case summary (no headers, plain facts)
    - Upserts to dialer_ai_summaries keyed by contact_id

    ↓
Next time rep opens that lead:
    - Right rail + center panel show the AI summary
```

---

## Supervisor Monitoring (Listen / Whisper / Barge)

Calls use Twilio Conferences which allow a third party to join any active call.

| Mode | Supervisor hears | Rep hears supervisor | Customer hears supervisor |
|---|---|---|---|
| Listen | Both sides | No | No |
| Whisper | Both sides | Yes | No |
| Barge | Both sides | Yes | Yes |

**How it works:**
1. Supervisor clicks Listen/Whisper/Barge on a rep's card on the Live Floor
2. Their Twilio Device (same device initialized at layout level) calls `device.connect({ ConferenceName, Mode })`
3. TwiML at `/api/dialer/twiml/voice` returns appropriate `<Conference>` attributes:
   - Listen: `muted=true, startConferenceOnEnter=false`
   - Whisper: `coaching=true, callSidToCoach={repCallSid}`
   - Barge: `startConferenceOnEnter=false` (unmuted)
4. Supervisor appears in the conference transparently

---

## Recording & Transcription Pipeline

| Step | Service | What happens |
|---|---|---|
| 1. Record | Twilio | Dual-channel conference recording started via REST API on `conference-start` event |
| 2. Notify | Twilio | Posts to `/api/dialer/twiml/recording` when recording is complete |
| 3. Transcribe | Deepgram Nova-2 | `multichannel=true`, `utterances=true`, `summarize=v2`, `smart_format=true` |
| 4. Callback | Deepgram | Posts completed transcript to `/api/dialer/twiml/transcript-callback` |
| 5. Summarize | Claude Haiku | Generates bullet-point case summary from transcript + SMS history + GHL fields |

**Channel mapping (dual-channel):**
- Channel 0 = Customer
- Channel 1 = Rep

**Cost per call (40 min):**
- Twilio recording: ~$0.10
- Deepgram transcription: ~$0.16
- Claude summary: ~$0.001
- **Total: ~$0.26/call**

---

## Database Schema

### `dialer_calls`
Stores every outbound call.

| Column | Type | Notes |
|---|---|---|
| call_sid | text PK | Twilio call SID (customer's leg) |
| contact_id | text | GHL contact ID |
| contact_name | text | |
| phone | text | Dialed number |
| rep_identity | text | e.g. 'karthik' |
| campaign_id | text | firmSlug:stageId |
| pipeline_id, stage_id, firm, stage_name | text | Campaign metadata |
| direction | text | 'outbound-api' |
| call_status | text | completed / no-answer / busy / failed |
| duration | int | Seconds |
| recording_url | text | Twilio .mp3 URL |
| recording_sid | text | |
| conference_sid | text | Twilio conference SID |
| rep_call_sid | text | Rep's call SID in conference |
| started_at, ended_at | timestamptz | |

### `dialer_transcripts`
One row per call recording.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| call_sid | text FK | References dialer_calls |
| contact_id | text | Denormalized for fast queries |
| provider | text | 'deepgram' |
| status | text | pending / completed / failed |
| request_id | text | Deepgram request ID |
| full_text | text | Speaker-labeled transcript |
| summary | text | Deepgram built-in summary |
| utterances | jsonb | `[{ speaker, start, end, transcript }]` |
| raw | jsonb | Full Deepgram response |
| completed_at | timestamptz | |

### `dialer_messages`
All SMS (inbound + outbound).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| message_sid | text unique | Twilio message SID |
| direction | text | 'inbound' \| 'outbound' |
| from_number, to_number | text | |
| body | text | Message content |
| status | text | sent / delivered / failed / received |
| media_url | text | MMS attachment |
| contact_id | text | GHL contact ID |
| contact_name | text | |
| rep_identity | text | Sender (outbound only) |
| firm | text | |
| read | boolean | default false |

### `dialer_ai_summaries`
One row per GHL contact, updated after every call.

| Column | Type | Notes |
|---|---|---|
| contact_id | text PK | GHL contact ID |
| summary | text | Bullet-point case summary from Claude |
| updated_at | timestamptz | Last updated |

### `dialer_active_sessions`
Live tracking of reps currently on calls. Row deleted when call ends.

| Column | Type | Notes |
|---|---|---|
| rep_identity | text PK | |
| conference_name | text | conf-{identity}-{timestamp} |
| conference_sid | text | Twilio SID |
| rep_call_sid | text | For whisper coaching |
| customer_call_sid | text | |
| customer_phone | text | |
| contact_id, contact_name | text | |
| firm, campaign | text | |
| started_at | timestamptz | |

### `dialer_rep_status`
Rep presence tracking. Updated whenever status changes on the agent page.

| Column | Type | Notes |
|---|---|---|
| rep_identity | text PK | |
| status | text | OFFLINE / READY / ON_CALL / PAUSED / WRAPUP |
| updated_at | timestamptz | |

---

## API Routes

### Voice / Calls
| Route | Method | Purpose |
|---|---|---|
| `/api/dialer/token` | GET | Generate Twilio JWT for browser SDK |
| `/api/dialer/call/start` | POST | Create conference + dial customer |
| `/api/dialer/rep-status` | PUT | Update rep presence status |
| `/api/dialer/live-floor` | GET | Aggregated live floor data |

### TwiML Webhooks (Twilio → us)
| Route | Method | Purpose |
|---|---|---|
| `/api/dialer/twiml/voice` | POST | Route call to conference |
| `/api/dialer/twiml/status` | POST | Customer call status updates |
| `/api/dialer/twiml/conference-status` | POST | Conference lifecycle events |
| `/api/dialer/twiml/recording` | POST | Recording ready → send to Deepgram |
| `/api/dialer/twiml/transcript-callback` | POST | Deepgram transcript ready |

### Leads & Contacts
| Route | Method | Purpose |
|---|---|---|
| `/api/dialer/campaigns` | GET | GHL pipeline stages as campaigns |
| `/api/dialer/leads` | GET | Paginated leads from GHL stage |
| `/api/dialer/leads-db` | GET | All leads from call history |
| `/api/dialer/leads-db/[contactId]` | GET | Call history + AI summary for one contact |
| `/api/dialer/contacts/[id]` | GET | Full GHL contact + custom fields |
| `/api/dialer/contacts/[id]/tags` | PUT | Sync tag changes to GHL |
| `/api/dialer/contacts/search` | GET | Search GHL contacts by name/phone |

### SMS
| Route | Method | Purpose |
|---|---|---|
| `/api/dialer/sms/send` | POST | Send outbound SMS |
| `/api/dialer/sms/thread` | GET | Message thread for a phone number |
| `/api/dialer/sms/conversations` | GET | All conversations (called + texted leads) |
| `/api/dialer/sms/inbound` | POST | Twilio inbound SMS webhook |

### AI
| Route | Purpose |
|---|---|
| `/api/dialer/ai-summary/generate.ts` | Shared function — generate Claude case summary |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_API_KEY_SID` | For JWT generation |
| `TWILIO_API_KEY_SECRET` | For JWT generation |
| `TWILIO_TWIML_APP_SID` | TwiML app for outbound calls |
| `TWILIO_CALLER_ID` | Outbound caller ID (`+12137344168`) |
| `DEEPGRAM_API_KEY` | Transcription |
| `ANTHROPIC_API_KEY` | Claude AI summaries |
| `NEXT_PUBLIC_BASE_URL` | Public URL for Twilio/Deepgram callbacks |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-side writes |
| `GHL_API_KEY` | GoHighLevel API |
| `GHL_LOCATION_ID` | GHL location |

---

## Twilio Configuration Checklist

These webhooks must be configured in the Twilio console:

| What | Where in Twilio | URL |
|---|---|---|
| TwiML App (Voice URL) | Voice → TwiML Apps → AP57ba7e5f... | `https://case-bridge.com/api/dialer/twiml/voice` |
| Inbound SMS webhook | Phone Numbers → +12137344168 → Messaging | `https://case-bridge.com/api/dialer/sms/inbound` |

---

## Supabase Migrations to Run

In order:

1. `supabase/migration_dialer.sql` — core calls + transcripts tables
2. `supabase/migration_messages.sql` — SMS messages table
3. `supabase/migration_ai_summaries.sql` — AI summaries table
4. `supabase/migration_add_transcript_summary.sql` — add summary column to transcripts
5. `supabase/migration_active_sessions.sql` — active sessions + rep status tables
6. `supabase/migration_dialer_calls_conference.sql` — add conference_sid, rep_call_sid to calls

---

## What's Still Stubbed / Not Built Yet

| Feature | Status |
|---|---|
| Caller ID management | Stub page — no backend |
| DNC list | Local state only — not persisted |
| Reports | Stub page — no backend |
| Disposition → GHL stage move | `ghlStageMove` field exists in types but API call not wired |
| Callback scheduling | Datetime collected in modal but not stored/surfaced |
| Rep management UI | Hardcoded list in `live-floor` API and `DialerNav` |
| Voicemail drop | Not built |
| Power dialer (auto-advance without disposition) | Not built |
