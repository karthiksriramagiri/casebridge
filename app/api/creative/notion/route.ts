import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { notionCheck } from '@/lib/notion'

/* GET /api/creative/notion — does the token actually reach the database?

   Connecting Notion fails in two quiet ways: the integration exists but was
   never shared with the database (Notion answers 404, as though it were not
   there), and the database id is copied from the page URL with the view id
   attached. Both look identical from the board — cards simply never appear.
   This says which one it is, and lists the property names the mirror will
   match against so a renamed column is visible before anyone wonders why a
   field is blank. */

export const dynamic = 'force-dynamic'

export async function GET() {
  // Property names are internal detail; keep them behind the same sign-in the
  // centers use rather than leaving a public probe of someone's workspace.
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const result = await notionCheck()
  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
