import fs from 'node:fs'
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'').replace(/\\n/g,'').trim()
}
import { createClient } from '@supabase/supabase-js'
async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('venu_sessions').select('id').order('started_at', { ascending: false }).limit(1)
  const id = data?.[0]?.id
  if (!id) { console.log('  no sessions yet'); return }
  const times: number[] = []
  for (let i = 0; i < 5; i++) {
    const t = Date.now()
    await db.from('venu_sessions').select('scenario_id, user_id').eq('id', id).single()
    times.push(Date.now() - t)
  }
  const avg = Math.round(times.reduce((a,b)=>a+b,0)/times.length)
  console.log(`  session lookup: ${times.join('ms, ')}ms  → avg ${avg}ms`)
  console.log(`  this runs before EVERY persona turn`)
}
main().catch(e => { console.error(e); process.exit(1) })
