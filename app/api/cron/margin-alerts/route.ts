import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatRange } from '@/lib/finance/reporting/dates'
import { loadFinanceData } from '@/lib/finance/reporting/load'
import { formatPct, formatUSD } from '@/lib/finance/reporting/money'
import { buildReport } from '@/lib/finance/reporting/report'
import { financeToday } from '@/lib/finance/clock'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/* ═══════════════════════════════════════════════════════════════════════════
   Margin alerts.

   An invoice's margin only ever falls while it is open: the revenue is
   billed once, on the day it is raised, and the advertising and intake
   that earn it accumulate every day after. So the question is not whether
   it will drop but when it has dropped far enough to be worth saying.

   Two alarms:

     every 5 points   a step down — 65 → 59 is one message, not six. The
                      band is floor(margin / 5) * 5, so a margin wobbling
                      between 61 and 59 crosses once and then stays put.

     at 30 percent    a red alert on top of the step, once, when the margin
                      first touches the line. It re-arms if the margin
                      climbs back above it, because the second fall is as
                      worth knowing as the first.

   Read on the invoiced basis, which is what the invoice page shows and
   what the firm was actually billed: the whole invoice against the spend
   inside its period. The cases basis answers a different question and
   would read as a margin nobody is being charged.

   State lives in invoice_margin_alerts. A reading on its own cannot say
   "dropped" — that needs the last one it was compared against.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The step an invoice is standing on. Five points wide, rounded down. */
const bandOf = (margin: number) => Math.floor(margin / 5) * 5

/** Below this, the red alert. */
const RED_LINE = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/* Its own webhook, deliberately. Every other channel in this workspace is
   somebody's working channel, and an invoice's margin is not a number to
   post into one of them by assuming. Unset, the run reports that and sends
   nothing rather than picking a channel on the author's behalf. */
const SLACK_WEBHOOK = process.env.SLACK_MARGIN_WEBHOOK

const MISSING_TABLE = /does not exist|schema cache/i

type Alert = {
  invoiceId: string
  number: string
  firmName: string
  margin: number
  previousMargin: number | null
  band: number
  previousBand: number | null
  /** True when this message is a 5-point step, as opposed to the red line alone. */
  stepped: boolean
  red: boolean
  revenue: number
  spend: number
  profit: number
  period: string
}

function block(a: Alert) {
  const fell = a.previousMargin === null ? null : a.previousMargin - a.margin
  const headline = a.red
    ? `🔴 *${a.number} · ${a.firmName}* margin is ${formatPct(a.margin)}`
    : `📉 *${a.number} · ${a.firmName}* margin is ${formatPct(a.margin)}`
  const movement =
    fell === null
      ? 'first reading on this invoice'
      : `down ${fell.toFixed(1)} points from ${formatPct(a.previousMargin)}`
  return [
    headline,
    /* Only a step claims to have crossed a line. A red alert fired inside
       the band it was already in has crossed nothing — saying it did would
       be the alert inventing a movement to justify itself. */
    a.stepped ? `${movement} · crossed below ${a.band + 5}%` : movement,
    `${formatUSD(a.revenue)} billed − ${formatUSD(a.spend)} spent = ${formatUSD(a.profit)} · ${a.period}`,
    a.red ? `*Red alert: this invoice is at or below ${RED_LINE}%.*` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const authHeader = request.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  /* A dry run reports what it would say and writes nothing — the only safe
     way to look at an alerting rule without spending the alert. */
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'
  /* A check: post every open invoice's margin now, whether or not anything
     crossed, and change nothing. It answers the question an alerting rule
     always raises on the quiet days — is it watching, and is it watching
     the right number — which silence cannot answer. */
  const check = request.nextUrl.searchParams.get('test') === '1'

  const store = await loadFinanceData()
  const today = financeToday()

  /* Open invoices only. A closed period's margin is history: it is read on
     the invoice page whenever anyone wants it, and alerting on it would be
     telling someone about a number they can no longer do anything about. */
  const open = store.invoices.filter((i) => i.periodStart <= today && i.periodEnd >= today)
  if (open.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, note: 'No invoice is open today.' })
  }

  const { data: stateRows, error: stateErr } = await supabase
    .from('invoice_margin_alerts')
    .select('invoice_id, last_margin, last_band, red_alerted')
  if (stateErr && !MISSING_TABLE.test(stateErr.message)) {
    return NextResponse.json({ error: stateErr.message }, { status: 500 })
  }
  /* No table yet: a real run has nowhere to remember what it said, so it
     refuses rather than alerting on every invoice every hour. A dry run
     carries on with an empty memory — being able to read the margins
     before the migration is run is the point of a dry run. */
  const noTable = Boolean(stateErr)
  if (noTable && !dryRun) {
    return NextResponse.json(
      { error: 'Run supabase/migration_margin_alerts.sql — the alert state table does not exist yet.' },
      { status: 503 },
    )
  }
  const state = new Map((stateRows ?? []).map((r: any) => [r.invoice_id, r]))

  const alerts: Alert[] = []
  /* Every open invoice, alerting or not. A run that reports only what it
     fired on cannot be checked against what it stayed silent about. */
  const readings: {
    number: string
    firmName: string
    margin: number | null
    band: number | null
    revenue: number
    spend: number
    profit: number
    alerted: boolean
  }[] = []

  for (const inv of open) {
    /* The invoice's own period, up to today — not a calendar month. Its
       margin is its billed revenue against the cost of its own days. */
    const report = buildReport(store, {
      basis: 'invoiced',
      preset: 'custom',
      start: inv.periodStart,
      end: today < inv.periodEnd ? today : inv.periodEnd,
      granularity: 'daily',
      firmId: inv.firmId,
      invoiceId: inv.id,
      comparison: 'none',
    })
    const m = report.current
    const margin = m.margin
    const prior = state.get(inv.id)
    const previousBand = prior?.last_band ?? null
    const previousMargin = prior?.last_margin == null ? null : Number(prior.last_margin)
    const wasRed = prior?.red_alerted === true

    const firmName = report.meta.firms.find((f) => f.id === inv.firmId)?.name ?? '—'
    if (margin === null) {
      readings.push({
        number: inv.number, firmName, margin: null, band: null,
        revenue: m.revenue, spend: m.totalSpend, profit: m.profit, alerted: false,
      })
      continue
    }

    const band = bandOf(margin)
    const isRed = margin <= RED_LINE
    /* A step down, or the red line newly crossed. A margin that rose, or
       sat still inside its band, says nothing — but it is still recorded,
       so the next fall is measured from where it really was. */
    const stepped = previousBand !== null && band < previousBand
    const newlyRed = isRed && !wasRed
    const alerted = stepped || newlyRed

    if (alerted) {
      alerts.push({
        invoiceId: inv.id,
        number: inv.number,
        firmName,
        margin,
        previousMargin,
        band,
        previousBand,
        stepped,
        red: isRed,
        revenue: m.revenue,
        spend: m.totalSpend,
        profit: m.profit,
        period: formatRange(inv.periodStart, inv.periodEnd),
      })
    }
    readings.push({
      number: inv.number, firmName, margin, band,
      revenue: m.revenue, spend: m.totalSpend, profit: m.profit, alerted,
    })

    if (!dryRun && !noTable) {
      await supabase.from('invoice_margin_alerts').upsert(
        {
          invoice_id: inv.id,
          last_margin: margin,
          last_band: band,
          /* Re-armed the moment it climbs back over the line, so a second
             fall is announced as loudly as the first. */
          red_alerted: isRed,
          ...(alerted ? { last_notified_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'invoice_id' },
      )
    }
  }

  if (check) {
    if (!SLACK_WEBHOOK) {
      return NextResponse.json({ ok: false, error: 'Set SLACK_MARGIN_WEBHOOK.', readings }, { status: 503 })
    }
    const lines = readings.map((r) => {
      const state = r.margin === null ? 'no revenue yet'
        : r.margin <= RED_LINE ? `🔴 ${formatPct(r.margin)} — at or below ${RED_LINE}%`
        : `${formatPct(r.margin)} · next alert below ${(r.band ?? 0)}%`
      return `*${r.number} · ${r.firmName}* — ${state}\n${formatUSD(r.revenue)} billed − ${formatUSD(r.spend)} spent = ${formatUSD(r.profit)}`
    })
    const res = await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `✅ Margin check — ${open.length} open invoice${open.length === 1 ? '' : 's'}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '✅ Margin check' } },
          {
            type: 'context',
            elements: [{
              type: 'mrkdwn',
              text: `Test post · alerts fire on every 5-point drop and a red alert at ${RED_LINE}% · figures through ${today}`,
            }],
          },
          ...lines.map((text) => ({ type: 'section', text: { type: 'mrkdwn', text } })),
        ],
      }),
    })
    return NextResponse.json({ ok: res.ok, check: true, posted: res.ok ? open.length : 0, readings })
  }

  if (alerts.length === 0) {
    return NextResponse.json({ ok: true, checked: open.length, sent: 0, readings })
  }
  if (!SLACK_WEBHOOK) {
    return NextResponse.json(
      {
        ok: false,
        checked: open.length,
        wouldSend: alerts.length,
        readings,
        error: 'Set SLACK_MARGIN_WEBHOOK to the channel these should post to. Nothing was sent.',
      },
      { status: 503 },
    )
  }
  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, checked: open.length, wouldSend: alerts.map(block), readings })
  }

  const red = alerts.filter((a) => a.red).length
  const res = await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: red > 0 ? `🔴 Margin alert — ${red} invoice${red === 1 ? '' : 's'} at or below ${RED_LINE}%` : '📉 Margin alert',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: red > 0 ? '🔴 Margin alert' : '📉 Margin alert' },
        },
        ...alerts.map((a) => ({ type: 'section', text: { type: 'mrkdwn', text: block(a) } })),
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Billed revenue against the spend inside each invoice's period · figures through ${today}` }],
        },
      ],
    }),
  })

  return NextResponse.json({
    ok: res.ok,
    checked: open.length,
    sent: res.ok ? alerts.length : 0,
    red,
    readings,
    ...(res.ok ? {} : { error: `Slack returned ${res.status}` }),
  })
}
