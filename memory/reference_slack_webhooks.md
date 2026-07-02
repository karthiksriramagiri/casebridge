---
name: Slack Webhooks
description: Slack webhook URLs by channel/purpose — never consolidate or share across purposes
type: reference
---

Each purpose has its own webhook. Do not reuse or merge them.

- **Clock In / Clock Out** → `SLACK_TIMECLOCK_WEBHOOK` — used by `app/api/teams/timeclock/route.ts` and `app/api/metrics/time-entries/route.ts`
- **GHL Task Reminders** → `SLACK_TASK_REMINDERS` — used by `app/api/cron/task-reminders/route.ts`
- **General / Other** → `SLACK_WEBHOOK_URL` — used by `lib/slack.ts`
- **Checks** → `SLACK_WEBHOOK_CHECKS`
