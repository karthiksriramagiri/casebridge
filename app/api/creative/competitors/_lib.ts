import { createClient } from '@supabase/supabase-js'

export const BUCKET = 'competitor-ads'

export function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** The briefs table not existing yet is the common pre-migration case. */
export function isMissingTable(message: string) {
  return /relation .* does not exist|schema cache|could not find the table/i.test(message)
}

export function anthropicHeaders() {
  return process.env.ANTHROPIC_WORKSPACE_ID
    ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } }
    : {}
}
