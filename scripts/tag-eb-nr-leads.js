// Tags all Eisenberg No Response pipeline contacts with "eb - nr"
// This will trigger the SMS Bot Outbound - EB workflow for each one

const GHL_API_KEY = 'pit-9699989c-4574-425a-9e40-e5f36a94b572'
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'
const EISENBERG_PIPELINE_ID = 'Yk4w3ML56ECc10PFzjpK'
const EISENBERG_NR_STAGE_ID = 'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b'
const TAG = 'eb - nr'

const headers = {
  Authorization: `Bearer ${GHL_API_KEY}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json',
}

async function fetchNrLeads() {
  const leads = []
  let url = `https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=${EISENBERG_PIPELINE_ID}&pipeline_stage_id=${EISENBERG_NR_STAGE_ID}&limit=100`
  let page = 0

  while (url && page < 20) {
    page++
    const res = await fetch(url, { headers })
    if (!res.ok) { console.error('Failed to fetch leads:', res.status, await res.text()); break }
    const data = await res.json()
    for (const opp of (data.opportunities || [])) {
      const contactId = opp.contact?.id
      const contactName = opp.contact?.name || opp.name || 'Unknown'
      if (contactId) leads.push({ contactId, contactName })
    }
    url = data.meta?.nextPageUrl || null
    console.log(`Fetched page ${page}: ${leads.length} leads so far`)
  }

  return leads
}

async function addTag(contactId, contactName) {
  // First check existing tags to avoid duplicates
  const res = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, { headers })
  if (!res.ok) { console.error(`  Failed to fetch ${contactName}: ${res.status}`); return false }
  const data = await res.json()
  const existing = (data.contact?.tags || []).map(t => t.toLowerCase().trim())
  if (existing.includes('eb - nr') || existing.includes('eb_nr')) {
    console.log(`  Skipping ${contactName} — already has tag`)
    return false
  }

  // Add the tag
  const tagRes = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}/tags`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tags: [TAG] }),
  })
  if (!tagRes.ok) { console.error(`  Failed to tag ${contactName}: ${tagRes.status}`, await tagRes.text()); return false }
  return true
}

async function main() {
  console.log('Fetching Eisenberg NR leads...')
  const leads = await fetchNrLeads()
  console.log(`\nFound ${leads.length} NR leads. Adding "${TAG}" tag to each...\n`)

  let tagged = 0
  let skipped = 0

  for (const { contactId, contactName } of leads) {
    process.stdout.write(`Tagging ${contactName}... `)
    const done = await addTag(contactId, contactName)
    if (done) { console.log('done'); tagged++ } else { skipped++ }
    await new Promise(r => setTimeout(r, 300)) // avoid rate limits
  }

  console.log(`\nDone. Tagged: ${tagged}, Skipped (already had tag): ${skipped}`)
}

main().catch(console.error)
