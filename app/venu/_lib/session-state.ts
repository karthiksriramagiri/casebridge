/**
 * In-memory state for live calls, shared by /api/venu/session and /api/venu/say.
 *
 * The conversation lives here rather than travelling up with every request: the
 * client used to send the whole history in a header, which is fine for three
 * turns and over the header size limit by twenty. The durable copy is the
 * client's, which is what gets persisted and scored at the end — this is only
 * what the caller needs to remember mid-call.
 */
export interface LiveSession {
  scenarioId: string
  userId: string
  history: { speaker: 'rep' | 'caller'; text: string }[]
}

const sessions = new Map<string, LiveSession>()

export function putSession(id: string, s: LiveSession) {
  sessions.set(id, s)
  // Bound the map — a long-lived process would otherwise keep every call it
  // has ever served.
  if (sessions.size > 500) {
    const oldest = sessions.keys().next().value
    if (oldest) sessions.delete(oldest)
  }
}

export function getSession(id: string): LiveSession | undefined {
  return sessions.get(id)
}
