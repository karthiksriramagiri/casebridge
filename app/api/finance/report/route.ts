import { NextRequest, NextResponse } from 'next/server'
import { parseFilters } from '@/lib/finance/reporting/filters'
import { loadFinanceData } from '@/lib/finance/reporting/load'
import { buildReport } from '@/lib/finance/reporting/report'

export const dynamic = 'force-dynamic'

/* The whole report in one response.

   The page renders this on the server, but the route exists on its own so
   the figures can be checked without a browser — `curl` it with the same
   query string the page uses and you get exactly what the page shows.
   That is the only way to tell a rendering bug from an arithmetic one. */
export async function GET(req: NextRequest) {
  try {
    const store = await loadFinanceData()
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const filters = parseFilters(params, { dataStart: store.dataStart, asOf: store.dataAsOf })
    return NextResponse.json(buildReport(store, filters))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
