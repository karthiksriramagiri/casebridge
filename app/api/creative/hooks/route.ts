import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadHooks, kindOf } from '@/app/_metrics/hooks-live'
import { ANGLE_TYPE_BY_PREFIX } from '@/app/_metrics/hooks'

export const dynamic = 'force-dynamic'

/* Naming a hook.

   A hook is a code and a name — A3 is "Accident", B13 is "Passenger Angle".
   The codes come into existence the moment someone puts one in an ad name;
   this is only about giving them a name, so the reports stop printing "A18"
   at people and say what A18 is.

   Which family a code belongs to is decided by its letter and nothing else,
   so the form cannot put a verbal name on a visual code. */

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET() {
  const hooks = await loadHooks()
  return NextResponse.json({
    visual: hooks.visual,
    verbal: hooks.verbal,
    custom: hooks.custom,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const code = String(body.code ?? '').trim().toUpperCase()
  const name = String(body.name ?? '').trim()

  if (!/^[A-L][0-9]{1,3}$/.test(code)) {
    return NextResponse.json(
      { error: 'A hook code is one letter A–L followed by a number — A18, B7, G12.' },
      { status: 400 },
    )
  }
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: 'Give the hook a name between 2 and 80 characters.' }, { status: 400 })
  }

  const kind = kindOf(code)
  if (!kind) return NextResponse.json({ error: `${code} is not a hook code.` }, { status: 400 })

  const db = supabaseAdmin()
  if (!db) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })

  /* Upsert rather than insert: naming a hook twice is a correction, not an
     error, and making the second attempt fail would be the wrong answer to
     someone fixing a typo. */
  const { data, error } = await db
    .from('creative_hooks')
    .upsert(
      { code, name, kind, created_by: String(body.createdBy ?? '').trim() || null },
      { onConflict: 'code' },
    )
    .select('code, name, kind, created_at')
    .single()

  if (error) {
    /* PostgREST does not say "relation does not exist" — it says it could
       not find the table in its schema cache. Matching only the Postgres
       wording meant the one error worth explaining fell through as raw
       jargon. */
    const missing =
      /relation .* does not exist/i.test(error.message) ||
      /could not find the table/i.test(error.message) ||
      error.code === 'PGRST205'
    return NextResponse.json(
      {
        error: missing
          ? 'The creative_hooks table does not exist yet — run supabase/migration_creative_hooks.sql in the SQL editor.'
          : error.message,
      },
      { status: missing ? 503 : 500 },
    )
  }

  return NextResponse.json({
    hook: data,
    family: ANGLE_TYPE_BY_PREFIX[code.charAt(0)] ?? null,
  })
}

export async function DELETE(req: NextRequest) {
  const code = String(req.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const db = supabaseAdmin()
  if (!db) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })

  /* Only ever removes the UI-added name. The static table underneath is
     untouched, so a built-in hook reverts to its shipped name rather than
     losing it. */
  const { error } = await db.from('creative_hooks').delete().eq('code', code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, code })
}
