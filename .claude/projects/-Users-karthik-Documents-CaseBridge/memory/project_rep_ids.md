---
name: Rep External IDs
description: GHL and Slack user IDs for each rep — used for call verification and notifications
type: project
---

Rep ID mapping (profile name → GHL user ID → Slack user ID):

| Rep | GHL User ID | Slack User ID |
|-----|-------------|---------------|
| Ziyad | Yfag4NMqX2HIaOOrXU7G | U0B8B2BE4BZ |
| Pablo | DNj1g2jJWDnSObPK0CHb | U0AV0KAR9EF |
| Mauricio | gzsChechxzf121Wk0VBo | U0BDB0H8Z33 |
| Irwing | euSfnQe7gJcZMUZOSkNu | U0BDVQRKHKJ |

Stored in: `lib/rep-ids.ts`

**Why:** Needed for call verification penalty cron — after a rep checkmarks a lead, we query GHL call logs filtered by that rep's GHL user ID to confirm they actually called within 120s.
