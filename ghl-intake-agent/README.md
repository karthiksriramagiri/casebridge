# GHL Intake Agent

Fills out GoHighLevel intake fields automatically when a case gets marked
"signed" — reading the SMS/email conversation, MMS photos, and (optionally)
Twilio call transcripts from your in-house dialer — so you review a
ready-made intake instead of copy/pasting everything by hand.

**It never sends anything to the firm.** It only fills fields, writes a
summary note on the contact, and swaps the trigger tag for a
"ready for review" tag so you know it's done.

## How it works

```
GHL: tag "signed-case" added
        │  (Workflow → Webhook action)
        ▼
Your server: POST /webhooks/ghl/signed-case  { contactId }
        │
        ├─ Pull all conversation threads + messages (GHL API)
        ├─ Pull MMS images from those messages
        ├─ Pull call transcripts for that phone number (Twilio, optional)
        ▼
Claude: reads all of it, returns structured JSON matching your field schema
        ▼
Write back to GHL: Contact custom fields + Opportunity custom fields
        + a note with the full summary + swap tag to "intake-ready-for-review"
```

## Setup

### 1. Install and configure

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `GHL_API_TOKEN` / `GHL_LOCATION_ID` — from your GHL agency Private
  Integration (Settings → Private Integrations) or OAuth app. Needs scopes:
  `conversations.readonly`, `contacts.readonly`, `contacts.write`,
  `opportunities.readonly`, `opportunities.write`.
- `ANTHROPIC_API_KEY` — from console.anthropic.com.
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — only if you want call
  transcripts pulled in from your in-house dialer.
- `WEBHOOK_SHARED_SECRET` — make up any string; you'll paste the same value
  into the GHL workflow so random requests can't trigger this.

### 2. Map your real custom fields

```bash
npm run list-fields
```

This prints every custom field ID in your sub-account. Open
`src/config/fields.js` and replace the placeholder `ghlFieldId` values with
the real ones (add/remove fields entirely to match what your firm actually
needs — this file is the whole schema).

### 3. Deploy it somewhere reachable

Any Node host works (Railway, Render, Fly.io, a small VPS). Locally for
testing:

```bash
npm start
# then expose it temporarily with, e.g., `ngrok http 3000`
```

### 4. Build the GHL workflow

In GHL: **Automation → Workflows → Create Workflow**

- **Trigger:** "Contact Tag" → tag = `signed-case` (or whatever you set as
  `SIGNED_TAG`)
- **Action:** "Webhook"
  - URL: `https://your-server/webhooks/ghl/signed-case`
  - Method: `POST`
  - Headers: `x-webhook-secret: <your WEBHOOK_SHARED_SECRET>`
  - Body (JSON): `{ "contactId": "{{contact.id}}" }`

That's it — adding the tag now kicks off the whole pipeline. When it's
done, the tag flips to `intake-ready-for-review`, the fields are filled,
and a summary note is sitting on the contact for you to check before it
goes to the firm.

## Notes / things to adjust for your setup

- **Opportunity matching:** the pipeline updates whatever opportunity comes
  back first for that contact. If a contact can have multiple open
  opportunities, tighten `getOpportunitiesForContact` in
  `src/services/ghlClient.js` to filter by pipeline/stage.
- **Call transcription:** Twilio doesn't transcribe calls for you unless
  you have Voice Intelligence enabled (recommended — set
  `TWILIO_INTELLIGENCE_SERVICE_SID`) or the legacy per-recording
  transcription add-on. If you use neither today, either turn one on, or
  swap in another speech-to-text provider inside
  `src/services/twilioClient.js::getCallTranscript`.
- **GHL API details:** GHL's v2 API occasionally shifts endpoint shapes —
  the calls in `src/services/ghlClient.js` match the documented behavior as
  of writing, but if anything 404s, check the current spec at
  https://highlevel.stoplight.io/ and adjust that one file.
- **Failure alerting:** right now a failed run just logs to the console
  (see the `TODO` in `src/server.js`). Wire that up to Slack/email so a
  bad run doesn't sit silently un-reviewed.
- **Accuracy:** Claude is instructed to only fill in what's explicitly
  stated and to flag gaps rather than guess — worth spot-checking the
  first few runs against the source conversation before you trust it fully.
