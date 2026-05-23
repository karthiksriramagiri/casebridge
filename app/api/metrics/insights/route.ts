import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { firm, summary, period, phase, adBreakdown } = body

  if (!firm || !summary) {
    return NextResponse.json({ error: 'Missing data.' }, { status: 400 })
  }

  const topAds = (adBreakdown || [])
    .filter((a: any) => a.spend > 50)
    .slice(0, 10)
    .map((a: any) => ({
      name: a.adName,
      spend: `$${a.spend.toFixed(0)}`,
      signedCases: a.signedCases,
      cpq: a.cpq ? `$${a.cpq.toFixed(0)}` : 'no conversions',
      metaLeads: a.metaLeads,
      cpl: a.cpl ? `$${a.cpl.toFixed(0)}` : '—',
    }))

  const prompt = `You are a business intelligence advisor for a personal injury law firm intake operation. Analyze this data and identify exactly where there may be performance leaks — whether it's ad creatives underperforming, workers dropping close rates, costs getting out of line, or something else.

FIRM: ${firm.name}
PERIOD: ${period.days} days (${period.start} to ${period.end})
PHASE: ${phase.label} (weekly spend: $${body.weeklySpend?.toFixed(0) || 0})

FINANCIAL KPIs:
- Total Ad Spend: $${summary.spend.toFixed(2)}
- Signed Cases: ${summary.signedCases}
- CPQ (Cost Per Qualified): ${summary.cpq ? '$' + summary.cpq.toFixed(2) : 'N/A — no conversions'}
- Adjusted CPQ (multi-victim): ${summary.adjustedCpq ? '$' + summary.adjustedCpq.toFixed(2) : 'N/A'}
- Case Value: $${summary.caseValue.toLocaleString()} per case
- Gross Revenue: $${summary.grossRevenue.toLocaleString()}
- Gross Profit: $${summary.grossProfit.toFixed(2)}
- Gross Margin: ${summary.grossMargin !== null ? summary.grossMargin.toFixed(1) + '%' : 'N/A'}
- Ops Expenses: $${summary.opsExpenses.toFixed(2)}
- Worker PR (pay): $${summary.workerPR.toFixed(2)}
- Net Profit: $${summary.netProfit.toFixed(2)}
- Net Margin: ${summary.netMargin !== null ? summary.netMargin.toFixed(1) + '%' : 'N/A'}

TOP AD CREATIVES (by spend):
${topAds.length > 0 ? JSON.stringify(topAds, null, 2) : 'No creative data available yet.'}

Your job:
1. Identify the single biggest performance leak right now (be specific — name it)
2. Give 3–5 key findings, each with a diagnosis and a recommended action
3. Flag any numbers that look off (high CPQ, low margin, no conversions on high-spend creatives)
4. Be direct and actionable — no filler, no generic advice

Respond in this exact JSON format:
{
  "headline": "One sentence summary of the most critical issue",
  "status": "warning" | "good" | "critical",
  "findings": [
    {
      "area": "Creatives | Spend | Conversions | Margins | Workers",
      "finding": "Specific observation",
      "action": "Specific recommended action"
    }
  ],
  "benchmarks": {
    "cpq_assessment": "good | high | very_high | no_data",
    "margin_assessment": "healthy | tight | negative | no_data",
    "spend_efficiency": "efficient | wasteful | mixed | no_data"
  }
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Return raw text if JSON parse fails
      return NextResponse.json({ headline: 'Analysis complete', raw: rawText, findings: [] })
    }

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('Insights error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
