/* ═══════════════════════════════════════════════════════════════════════════
   One callback per GHL task, whether or not the index exists yet.

   Two webhooks create a callback from the same task — /webhooks/ghl/task and
   /webhooks/ghl/callback — and GHL fires them about two seconds apart. Both
   read "no callback exists" before either writes, so checking first cannot
   win: 146 of the last 150 task ids ended up twice, and the floor saw two
   identical reminders for one call. The only guard that race cannot cross is
   a unique index, which is what migration_callback_dedupe.sql adds.

   Until that migration runs, `ON CONFLICT (ghl_task_id)` is not merely
   ineffective — Postgres rejects the statement outright with 42P10, and
   every callback GHL sends would fail to record at all. Shipping the upsert
   ahead of the index would take the floor's callbacks down completely.

   So: upsert, and if the database says there is nothing to conflict on, fall
   back to the check-then-insert this replaced. That fallback is exactly what
   production does today — racy, occasionally duplicating — so the worst case
   after a deploy is the behaviour before it, and the moment the index lands
   the real guard takes over with no further deploy.
   ═══════════════════════════════════════════════════════════════════════════ */

const NO_MATCHING_CONSTRAINT = '42P10'

export interface CallbackRow {
  contact_id:        string
  contact_name:      string | null
  phone:             string | null
  firm:              string | null
  callback_at:       string
  callback_context:  string | null
  source:            string
  ghl_task_id:       string | null
  owner_rep?:        string | null
  stage_name?:       string | null
}

/** Record a callback, at most one per GHL task. Returns what it had to do. */
export async function upsertCallback(
  db: any,
  row: CallbackRow,
): Promise<{ error: { message: string } | null; deduped: boolean }> {
  // No task id — a rep typed this one in, and any number of those may exist.
  if (!row.ghl_task_id) {
    const { error } = await db.from('dialer_callbacks').insert(row)
    return { error, deduped: false }
  }

  const { error } = await db.from('dialer_callbacks')
    .upsert(row, { onConflict: 'ghl_task_id' })

  if (!error) return { error: null, deduped: true }
  if (error.code !== NO_MATCHING_CONSTRAINT) return { error, deduped: true }

  console.warn(
    '[callbacks] no unique index on ghl_task_id — run migration_callback_dedupe.sql. ' +
    'Falling back to check-then-insert, which can still duplicate.',
  )

  /* The pre-index behaviour, kept honest about what it is. */
  const { data: existing } = await db.from('dialer_callbacks')
    .select('id')
    .eq('ghl_task_id', row.ghl_task_id)
    .maybeSingle()

  if (existing?.id) {
    const { error: updErr } = await db.from('dialer_callbacks')
      .update(row).eq('id', existing.id)
    return { error: updErr, deduped: false }
  }

  const { error: insErr } = await db.from('dialer_callbacks').insert(row)
  return { error: insErr, deduped: false }
}
