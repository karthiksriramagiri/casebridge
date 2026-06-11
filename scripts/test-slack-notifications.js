const WEBHOOK = process.env.SLACK_WEBHOOK_URL || ''

async function send(payload) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.text()
}

async function main() {
  console.log('Sending test notifications...\n')

  const r1 = await send({
    text: '⚠️ [TEST] John Doe has not signed their NDA',
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⚠️ *[TEST] John Doe* has not signed their NDA\nAccount was created 26 hours ago and the NDA remains unsigned.',
      },
    }],
  })
  console.log('1. NDA overdue:', r1)

  const r2 = await send({
    text: '✅ [TEST] John Doe completed Level 1: Initial Phase',
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✅ *[TEST] John Doe* completed *Level 1: Initial Phase*\nAll lessons in this phase are now complete.',
      },
    }],
  })
  console.log('2. Level complete:', r2)

  const r3 = await send({
    text: '🚨 [TEST] John Doe left the tab during a quiz',
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🚨 *[TEST] John Doe* left the tab during a quiz\n*Module:* BM Overview\n*Tab leaves this attempt:* 1',
      },
    }],
  })
  console.log('3. Tab cheat:', r3)

  const r4 = await send({
    text: '⏰ [TEST] John Doe ran out of time on Level 2',
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⏰ *[TEST] John Doe* ran out of time\n*Level 2: Onboarding Phase* was not completed within the 4-hour window.',
      },
    }],
  })
  console.log('4. Timer expired:', r4)
}

main().catch(console.error)
