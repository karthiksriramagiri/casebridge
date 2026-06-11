const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || ''

export async function sendSlack(payload: { text: string; blocks?: object[] }) {
  try {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error('[Slack] notification failed:', e)
  }
}

// Level helpers shared with quiz and dashboard notifications
export const LEVEL_PROGRAM_NAMES: Record<number, string[]> = {
  1: ['introduction', 'qualification training'],
  2: ['ops overview', 'main training module'],
  3: ['hr guidelines'],
}

export const LEVEL_LABELS: Record<number, string> = {
  1: 'Initial Phase',
  2: 'Onboarding Phase',
  3: 'Active Phase',
}

export function getProgramLevel(name: string): number {
  const lower = name.toLowerCase()
  for (const [lvl, names] of Object.entries(LEVEL_PROGRAM_NAMES)) {
    if (names.some((n) => lower.includes(n) || n.includes(lower))) return Number(lvl)
  }
  return 3
}
