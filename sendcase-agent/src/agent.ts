// The intake agent.
//
// This is a real agent loop rather than a single extraction call because the
// evidence differs per case: one case has three call transcripts and no SMS,
// the next has a long text thread and a photo of the police report. The agent
// decides what else it needs to read until it can fill the fields, instead of
// every case paying for every source.

import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

import { INTAKE_FIELDS, LABEL_TO_ID, FIELD_LABELS, fieldGuide } from './fields.js'
import {
  getContact,
  getConversations,
  getMessages,
  getNotes,
  updateContactFields,
  addNote,
} from './ghl.js'
import { getTranscripts, getStoredMessages, markProcessing, saveJob } from './store.js'
import { notifyReady } from './slack.js'

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5'
const MAX_PHOTOS = Number(process.env.MAX_PHOTOS ?? 6)

export interface RunResult {
  contactId: string
  contactName: string | null
  firm: string | null
  status: 'completed' | 'no_data' | 'error'
  written: Record<string, string>
  skipped: Record<string, string>
  extracted: Record<string, string>
  flags: string[]
  summary: string | null
  error?: string
  iterations: number
}

const SYSTEM = `You are an intake specialist for a personal-injury law firm. A case has reached
"Pending Send", meaning it is signed and about to go to the firm. Your job is to fill in the
client's intake fields from whatever the firm already has on record, so a human reviewer sees a
ready-made intake instead of copy-pasting from call recordings and text threads.

You have tools to read the contact record, the SMS history, the call transcripts, the GHL
conversation threads, and the notes. Start with the cheap local sources (SMS history and call
transcripts come from our own database). Only reach into the GHL conversation threads if the
local sources left fields unanswered — those calls consume a shared API quota.

Fields to fill:
${fieldGuide()}

Rules:
- Only record something a source actually supports. Never invent, infer a plausible value, or
  fill a field from general knowledge about car accidents.
- If a source is ambiguous or two sources disagree, leave the field out and add a flag saying so.
  A blank field costs the reviewer a minute; a confidently wrong field can damage the case.
- Quote or closely paraphrase the client's own words for narrative fields like Incident Notes.
- Dates must be YYYY-MM-DD. If the client said something relative ("last Tuesday"), work it out
  from the message timestamp and flag that you did.
- A human reviews everything you write, so surface doubt rather than resolving it silently.
- When you have gathered what you can, call save_intake exactly once. Include every field you
  are confident about, a short summary of the case, and a flag for anything the reviewer should
  check. Do not call save_intake more than once.`

// An org-level API key (one not scoped to a workspace) must name a workspace on
// every request, or the API rejects it with a 400. A workspace-scoped key needs
// nothing here.
function anthropic(): Anthropic {
  const workspace = (process.env.ANTHROPIC_WORKSPACE_ID ?? '').trim()
  return new Anthropic(
    workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}
  )
}

export async function runAgent(input: {
  contactId: string
  contactName?: string | null
  firm?: string | null
}): Promise<RunResult> {
  const { contactId } = input
  const client = anthropic()

  const result: RunResult = {
    contactId,
    contactName: input.contactName ?? null,
    firm: input.firm ?? null,
    status: 'error',
    written: {},
    skipped: {},
    extracted: {},
    flags: [],
    summary: null,
    iterations: 0,
  }

  await markProcessing(contactId, result.contactName, result.firm)

  // Pulled once up front: the agent needs to know what already has a value so
  // it doesn't spend effort on fields that are done.
  const contact = await getContact(contactId)
  result.contactName =
    contact?.contactName ??
    [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') ??
    result.contactName

  const existing: Record<string, string> = {}
  for (const cf of contact?.customFields ?? []) {
    if (!(cf.id in INTAKE_FIELDS)) continue
    const val = cf.value ?? cf.fieldValue
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      existing[cf.id] = String(val)
    }
  }

  let saved = false

  // ── Tools ─────────────────────────────────────────────────────────────────

  const readContact = betaZodTool({
    name: 'read_contact',
    description:
      'The GHL contact record: name, phone, email, date of birth, tags, and which intake ' +
      'fields already have values. Fields listed as already-filled will not be overwritten.',
    inputSchema: z.object({}),
    run: async () => {
      const filled = Object.entries(existing).map(
        ([id, v]) => `${INTAKE_FIELDS[id]?.label ?? id}: ${v}`
      )
      const blank = Object.entries(INTAKE_FIELDS)
        .filter(([id]) => !(id in existing))
        .map(([, f]) => f.label)
      return JSON.stringify(
        {
          name: result.contactName,
          phone: contact?.phone ?? null,
          email: contact?.email ?? null,
          dateOfBirth: contact?.dateOfBirth ?? null,
          tags: contact?.tags ?? [],
          alreadyFilled: filled,
          stillBlank: blank,
        },
        null,
        2
      )
    },
  })

  const readSmsHistory = betaZodTool({
    name: 'read_sms_history',
    description:
      'Every SMS to and from this client that our dialer recorded, oldest first. Local ' +
      'database read — costs no GHL quota, so prefer this over the GHL conversation threads.',
    inputSchema: z.object({}),
    run: async () => {
      const msgs = await getStoredMessages(contactId)
      if (!msgs.length) return 'No SMS history on record.'
      return msgs
        .map((m) => `[${m.created_at ?? '?'}] ${m.direction ?? '?'}: ${m.body ?? ''}`)
        .join('\n')
    },
  })

  const readCallTranscripts = betaZodTool({
    name: 'read_call_transcripts',
    description:
      'Transcripts of recorded calls with this client, oldest first. Local database read — ' +
      'costs no GHL quota. Usually the richest source for accident details.',
    inputSchema: z.object({}),
    run: async () => {
      const ts = await getTranscripts(contactId)
      if (!ts.length) return 'No call transcripts on record.'
      return ts
        .map(
          (t, i) =>
            `--- Call ${i + 1} (${t.completed_at ?? 'unknown date'}) ---\n${t.full_text ?? ''}`
        )
        .join('\n\n')
    },
  })

  const readGhlConversations = betaZodTool({
    name: 'read_ghl_conversations',
    description:
      'Message threads stored in GHL, including email and any messages our dialer did not ' +
      'capture. This spends the shared GHL API quota — use it only when the local sources ' +
      'left fields unanswered.',
    inputSchema: z.object({
      reason: z
        .string()
        .describe('Which fields you are still missing that this might answer'),
    }),
    run: async (inp) => {
      console.log(`[agent] ${contactId} reading GHL conversations: ${inp.reason}`)
      const convos = await getConversations(contactId)
      if (!convos.length) return 'No GHL conversation threads found.'
      const chunks: string[] = []
      for (const c of convos.slice(0, 5)) {
        const msgs = await getMessages(c.id)
        chunks.push(
          `--- Thread ${c.id} (${c.type ?? 'unknown type'}) ---\n` +
            msgs
              .map((m: any) => `[${m.dateAdded ?? '?'}] ${m.direction ?? '?'}: ${m.body ?? ''}`)
              .join('\n')
        )
      }
      return chunks.join('\n\n')
    },
  })

  const readNotes = betaZodTool({
    name: 'read_notes',
    description:
      'Notes staff have written on this contact. Spends GHL quota. Useful for details a rep ' +
      'typed rather than said, and for catching prior intake attempts.',
    inputSchema: z.object({}),
    run: async () => {
      const notes = await getNotes(contactId)
      if (!notes.length) return 'No notes on this contact.'
      return notes
        .map((n: any) => `[${n.dateAdded ?? '?'}] ${n.body ?? ''}`)
        .join('\n\n')
    },
  })

  const saveIntake = betaZodTool({
    name: 'save_intake',
    description:
      'Write the intake fields to GHL and mark the case ready for human review. Call this ' +
      'exactly once, when you have gathered what you can. Fields that already have a value ' +
      'are left untouched.',
    inputSchema: z.object({
      fields: z
        .array(
          z.object({
            label: z.string().describe('Exact field label from the list in your instructions'),
            value: z.string().describe('The value to write'),
            source: z
              .string()
              .describe('Where this came from, e.g. "call 2 transcript" or "SMS 2026-09-03"'),
          })
        )
        .describe('Only fields you are confident about'),
      summary: z.string().describe('2-4 sentences a reviewer can read to understand the case'),
      flags: z
        .array(z.string())
        .describe('Anything the reviewer should check: ambiguity, conflicts, gaps'),
    }),
    run: async (inp) => {
      if (saved) {
        return 'save_intake was already called for this case. Do not call it again.'
      }
      saved = true

      const toWrite: { id: string; field_value: string }[] = []
      const unknownLabels: string[] = []

      for (const f of inp.fields) {
        const id = LABEL_TO_ID[f.label]
        if (!id) {
          unknownLabels.push(f.label)
          continue
        }
        result.extracted[f.label] = f.value

        // Never overwrite a value a human already put there. Enforced here so
        // the agent cannot clobber good data even if it tries.
        if (id in existing) {
          result.skipped[f.label] = existing[id]
          continue
        }
        toWrite.push({ id, field_value: f.value })
        result.written[f.label] = f.value
      }

      result.summary = inp.summary
      result.flags = [...inp.flags]
      if (unknownLabels.length) {
        result.flags.push(`Agent proposed unrecognised field labels: ${unknownLabels.join(', ')}`)
      }

      if (toWrite.length) {
        await updateContactFields(contactId, toWrite)
        await addNote(
          contactId,
          `Intake auto-filled by sendcase-agent — ready for review.\n\n${inp.summary}` +
            (result.flags.length ? `\n\nFlags:\n- ${result.flags.join('\n- ')}` : '')
        )
      }

      result.status = toWrite.length ? 'completed' : 'no_data'

      return (
        `Wrote ${toWrite.length} field(s). ` +
        `Left ${Object.keys(result.skipped).length} alone (already had values). ` +
        `The case is now marked ready for review. You are done — do not call any more tools.`
      )
    },
  })

  // ── Photos, attached up front when enabled ────────────────────────────────

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: 'text',
      text:
        `Fill the intake for contact ${contactId}` +
        (result.contactName ? ` (${result.contactName})` : '') +
        (result.firm ? `, firm: ${result.firm}` : '') +
        `. Read what you need, then call save_intake once.`,
    },
  ]

  if (MAX_PHOTOS > 0) {
    for (const url of await collectPhotoUrls(contactId)) {
      content.push({ type: 'image', source: { type: 'url', url } })
    }
  }

  // ── Run the loop ──────────────────────────────────────────────────────────

  try {
    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: SYSTEM,
      tools: [
        readContact,
        readSmsHistory,
        readCallTranscripts,
        readGhlConversations,
        readNotes,
        saveIntake,
      ],
      messages: [{ role: 'user', content }],
    })

    for await (const message of runner) {
      result.iterations++
      if (message.stop_reason === 'refusal') {
        throw new Error(
          `Model declined: ${message.stop_details?.explanation ?? 'no explanation given'}`
        )
      }
      // Once save_intake has run, the case is done; stop burning iterations.
      if (saved && message.stop_reason === 'end_turn') break
    }

    if (!saved) {
      result.status = 'no_data'
      result.flags.push('Agent finished without calling save_intake — nothing was written.')
    }
  } catch (err: any) {
    result.status = 'error'
    result.error = err?.message ?? String(err)
    console.error(`[agent] ${contactId} failed:`, err)
  }

  await saveJob({
    contactId,
    contactName: result.contactName,
    firm: result.firm,
    status: result.status,
    fieldsWritten: result.written,
    fieldsSkipped: result.skipped,
    fieldsExtracted: result.extracted,
    flags: result.flags,
    summary: result.summary,
    error: result.error ?? null,
  })

  if (result.status === 'completed' || result.status === 'no_data') {
    await notifyReady({
      contactId,
      contactName: result.contactName,
      firm: result.firm,
      written: result.written,
      skipped: result.skipped,
      flags: result.flags,
      summary: result.summary,
    })
  }

  return result
}

// Best-effort scan for image attachments on GHL messages.
//
// CAVEAT: GHL's attachment shape varies by message type and is the least
// verified part of this service. If photos never show up, log a thread from
// read_ghl_conversations and adjust the field names below.
async function collectPhotoUrls(contactId: string): Promise<string[]> {
  const urls: string[] = []
  try {
    const convos = await getConversations(contactId)
    for (const c of convos.slice(0, 3)) {
      const msgs = await getMessages(c.id)
      for (const m of msgs) {
        const attachments: string[] = m.attachments ?? m.attachmentUrls ?? []
        for (const a of attachments) {
          const url = typeof a === 'string' ? a : (a as any)?.url
          if (url && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) urls.push(url)
          if (urls.length >= MAX_PHOTOS) return urls
        }
      }
    }
  } catch (err) {
    console.warn('[agent] photo scan failed (continuing without photos)', err)
  }
  return urls
}
