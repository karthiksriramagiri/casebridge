import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/metrics/firms/latest-invoice?slug=lhp
 * Returns the latest invoice code for a firm slug, then the caller can redirect.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const { data: firm } = await supabase
    .from('firms')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!firm) return NextResponse.json({ error: 'firm not found' }, { status: 404 })

  const { data: invoice } = await supabase
    .from('firm_invoices')
    .select('code')
    .eq('firm_id', firm.id)
    .order('sort_order', { ascending: false })
    .order('period_start', { ascending: false })
    .limit(1)
    .single()

  if (!invoice) return NextResponse.json({ error: 'no invoices found' }, { status: 404 })

  return NextResponse.json({ code: invoice.code, slug })
}
