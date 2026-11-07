'use client'

import type { KillItem, LaunchTask, WatchItem } from './types'

/* ═══════════════════════════════════════════════════════════════════════════
   Talking to the watch, kill and launch tables.

   Same contract as the assignment board's client: the store updates its own
   state first so the page moves under the cursor, and the write follows. A
   failure is reported, not thrown at the render.

   The one difference is the temporary id. A row invented in the browser gets
   `w_12`; the database answers with a uuid. The store swaps one for the other
   when the write lands, because an update sent against `w_12` would have
   nothing to update.
   ═══════════════════════════════════════════════════════════════════════════ */

const URL = '/api/creative/board'

/** `removed` is a Watch List Mode hide — see the migration. */
export type StoredWatch = WatchItem & { removed?: boolean }

export type BoardState = {
  watch: StoredWatch[]
  kill: KillItem[]
  launches: LaunchTask[]
  setupNeeded: boolean
  error: string | null
}

export const emptyBoardState: BoardState = {
  watch: [], kill: [], launches: [], setupNeeded: false, error: null,
}

export async function fetchBoardState(): Promise<BoardState> {
  try {
    const res = await fetch(URL, { cache: 'no-store' })
    const d = await res.json()
    return {
      watch: d.watch ?? [],
      kill: d.kill ?? [],
      launches: d.launches ?? [],
      setupNeeded: !!d.setupNeeded,
      error: d.error ?? null,
    }
  } catch (e) {
    return { ...emptyBoardState, error: (e as Error).message }
  }
}

type Board = 'watch' | 'kill' | 'launches'

async function send(board: Board, method: 'POST' | 'PATCH', body: unknown): Promise<any> {
  const res = await fetch(`${URL}?board=${board}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error ?? d.setup ?? `${method} ${board} failed`)
  if (d?.error) throw new Error(d.error)
  return d
}

export const boardApi = {
  create: (board: Board, row: Record<string, unknown>) =>
    send(board, 'POST', row).then((d) => d.item as { id: string }),
  patch: (board: Board, id: string, patch: Record<string, unknown>) =>
    send(board, 'PATCH', { id, ...patch }),
  remove: async (board: Board, id: string) => {
    const res = await fetch(`${URL}?board=${board}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'delete failed')
  },
}
