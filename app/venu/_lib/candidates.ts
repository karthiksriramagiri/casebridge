/* ═══════════════════════════════════════════════════════════════════════════
   Interview onboarding — the candidate side of Venu.

   A candidate opens the shared link, makes a temporary account and uploads
   the recording of their first interview. The token minted at signup is the
   account: it is the URL they come back to, and the only thing authorising
   their reads and writes. No password, no auth user — those only appear once
   they are qualified and onboarded into the Team Center.
   ═══════════════════════════════════════════════════════════════════════════ */

export const INTERVIEW_BUCKET = 'venu-interviews'

/** Two gigabytes — a screen-recorded hour of video sits well inside it. */
export const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024

export type CandidateStatus = 'invited' | 'submitted' | 'qualified' | 'not_qualified' | 'onboarded'

export const STATUS_LABEL: Record<CandidateStatus, string> = {
  invited:       'Started',
  submitted:     'Awaiting review',
  qualified:     'Qualified',
  not_qualified: 'Not qualified',
  onboarded:     'Onboarded',
}

export type Question = {
  key: string
  /** What Venu says, word for word from the interview script. */
  ask: string
  hint?: string
  rows?: number
}

/* ── The interview, as Venu runs it ────────────────────────────────────────
   Straight from the Case Bridge interview script: the introduction, the two
   questions, the compensation explanation and the shifts. A candidate who
   answers is taken through to the end — the qualified/not-qualified call is
   ours to make afterwards from the review queue, not something to decide in
   front of them mid-flow.                                                  */

export const INTRO = [
  'Hi, nice to meet you. My name is Venu, and I am with Case Bridge.',
  'Just to give you a quick introduction about us, Case Bridge is one of the largest legal marketing companies working directly with law firms nationwide. We help provide signed leads, specifically in the Motor Vehicle Accident vertical, and we generate leads nationwide in large volume.',
  'Thank you for scheduling a call with us today.',
]

export const QUALIFICATION_QUESTIONS: Question[] = [
  {
    key: 'introduction',
    ask: 'To start, can you please introduce yourself? Please share your name, a little bit about your background, and whether you have any previous experience calling leads, following up with clients, or closing leads over the phone.',
    rows: 7,
  },
  {
    key: 'schedule',
    ask: 'Before we continue, what type of work schedule or shift are you looking for? Are you available for full-time work, and what hours are you available to work?',
    hint: 'The shifts we run are listed below.',
    rows: 5,
  },
]

export const COMPENSATION = [
  'For compensation, we start with a base hourly rate of $5 per hour.',
  'Depending on your performance, reliability, and how long you work with us, the hourly rate can increase up to $10 per hour.',
  'On top of the hourly pay, we also offer closing incentives. This means that when you successfully close a lead, you can earn an additional incentive. The incentive starts at $30 per close and can go up to $50 per close.',
  'We will provide further training and modules so you understand exactly what counts as a close and how the process works.',
]

export const SHIFTS = {
  hr: [
    { name: 'Morning',   window: '7AM – 12PM PST', hours: '5 hrs' },
    { name: 'Afternoon', window: '12PM – 3PM PST', hours: '3 hrs' },
    { name: 'Evening',   window: '3PM – 9PM PST',  hours: '6 hrs' },
    { name: 'Overnight', window: '9PM – 7AM PST',  hours: '10 hrs' },
  ],
  training: [
    { name: 'Training',  window: '7AM – 3PM PST',  hours: '8 hrs' },
  ],
}

export const CLOSING = [
  'To move forward, we will invite you to our Team Center, where you will be able to review instructions, training materials, and the next steps.',
  'Thank you again for your time. We look forward to moving forward with you.',
]

export const REQUIRED_KEYS = QUALIFICATION_QUESTIONS.map(q => q.key)

/* ── The interview Venu runs ───────────────────────────────────────────────
   She is not reading a script down the page. The script is the ground she has
   to cover; how she gets there is a conversation — she reacts to the answer
   she just heard and digs into it before moving on, because "which dialer did
   you use" is the question that actually tells us whether someone has done
   this work.                                                               */

export const OPENING = INTRO.join(' ') + ' ' + QUALIFICATION_QUESTIONS[0].ask

/* Which part of the interview she is on.

   Left to itself the model will keep chasing a question the candidate dodged —
   it asked the same "did you close those, or hand them off" three turns
   running in testing, which reads as not listening and burns the call. The
   step is therefore computed from what has actually happened and handed to
   her every turn, so there is never a decision to make about whether to move
   on: she is told. */
export function nextStep(turns: Turn[]): string {
  const answers = turns.filter(t => t.who === 'candidate').length
  const shown = new Set(turns.map(t => t.card).filter(Boolean))

  if (shown.has('pay')) return 'RIGHT NOW: they have seen the pay. Close the call and ask for their phone number.'
  if (shown.has('shifts')) return 'RIGHT NOW: they have seen the shifts. Acknowledge what they picked, then move to the pay.'
  // Three answers is plenty of digging; after that the call has to move.
  if (answers >= 3) return 'RIGHT NOW: you have asked enough about their background — do not ask about it again, even if something was left unanswered. Ask about their schedule, hours and whether they can work weekends, and show them the shifts.'
  if (answers >= 1) return 'RIGHT NOW: dig once more into what they actually did — the dialer, the CRM, the volume, or whether they closed. One question.'
  return 'RIGHT NOW: they have just introduced themselves. React to it and ask one follow-up about their phone experience.'
}

export function interviewerSystem(candidateName: string): string {
  return [
    `You are Venu, a friendly recruiter at Case Bridge interviewing ${candidateName || 'a candidate'} by voice for a phone-sales role.`,
    '',
    'Case Bridge is one of the largest legal marketing companies working directly with law firms nationwide, providing signed leads in the Motor Vehicle Accident vertical.',
    '',
    'GROUND TO COVER, in order:',
    '1. Their background and any experience calling leads, following up with clients, or closing over the phone.',
    '2. Follow up on what they actually did — which dialer or CRM they used, what kind of leads, how many calls a day, whether they closed or only set appointments. Ask about whatever they mention; two or three follow-ups is plenty.',
    `3. What schedule they want: full time or part time, which hours, and whether they can work weekends. Do not read the shift list out loud — say something like "here are the shifts we run, have a look and tell me which one suits you" and end that message with ${SHIFTS_MARKER}. They will see the shifts on screen.`,
    `4. The pay. Do not read the rates out loud either — say something like "here is how the pay works" in a sentence, and end that message with ${PAY_MARKER}. They will see the numbers on screen.`,
    `5. Then close: "${CLOSING[0]}" and ask for their phone number so we can send the instructions. End that message with ${DONE_MARKER}.`,
    '',
    'HOW YOU TALK:',
    '- Like a person on a call, not a form. React to what they said before you ask the next thing — "Oh nice, so you were on the dialer all day", "That is a lot of calls".',
    '- Warm and a little enthusiastic. It is fine to be pleased by a good answer.',
    '- Two or three sentences at most. This is spoken aloud — long paragraphs are unbearable to listen to, and lists of times and dollar amounts are worse.',
    '- One question at a time. Never stack two.',
    '- Plain spoken words only. No bullet points, no markdown, no emoji, no stage directions.',
    '- If an answer is vague, ask them to be specific once, then move on.',
    '- Never ask something you have already asked. If they did not answer it, let it go and go to the next thing on the list — a question asked twice reads as not listening.',
    `- The markers ${SHIFTS_MARKER}, ${PAY_MARKER} and ${DONE_MARKER} each belong on exactly one message, at the very end of it.`,
    '- Never circle back to an earlier topic once you have moved past it, even if they dodged the question. Follow the step you are given below.',
  ].join('\n')
}

/* Markers are how Venu tells the page to put something on screen. They are
   stripped before a word is spoken or shown, so the candidate never sees one.
   Showing the shifts and the rates beats reading them aloud twice over: a list
   of times is miserable to listen to, and it keeps her turns short, which is
   what makes the call feel quick. */
export const DONE_MARKER = '<<PHONE>>'
export const SHIFTS_MARKER = '<<SHIFTS>>'
export const PAY_MARKER = '<<PAY>>'
export const MARKERS = [DONE_MARKER, SHIFTS_MARKER, PAY_MARKER]

/** The pay, as a card rather than a paragraph. */
export const PAY_TABLE = [
  { label: 'Base rate', value: '$5 / hour' },
  { label: 'Grows to', value: '$10 / hour', note: 'with performance, reliability and time with us' },
  { label: 'Per close', value: '$30 – $50', note: 'closing incentive on top of the hourly' },
  { label: 'Training', value: 'Provided', note: 'modules covering exactly what counts as a close' },
]

/** The same voice Venu uses in setter training, so she is one character
 *  across the product. Expressive by nature, which is what carries the warmth
 *  through — the enthusiasm comes from the voice and from how she words
 *  things, not from punctuation tricks. */
export const VENU_VOICE = 'aura-2-andromeda-en'

/** Below this and they did not really answer — a cough, or a misfired mic. */
export const MIN_ANSWER_MS = 2000

/** Digits only, with a leading + — what WhatsApp and Twilio both want. */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/[^\d]/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  // A bare 10-digit number is North American; anything longer carries its own country code.
  return digits.length === 10 ? `+1${digits}` : `+${digits.replace(/^0+/, '')}`
}

/** wa.me only takes the digits. */
export const waLink = (phone: string) => `https://wa.me/${String(phone).replace(/[^\d]/g, '')}`

/** URL-safe, unguessable, and short enough to paste into a chat. */
export function newToken(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

/** The Team Center login is the first name, and the password is that name
 *  with 123 after it — Karthik / Karthik123. Easy to read out over WhatsApp,
 *  which is how it gets delivered. */
export function firstNameOf(fullName: string): string {
  const first = String(fullName || '').trim().split(/\s+/)[0] ?? ''
  if (!first) return 'Rep'
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export const passwordFor = (fullName: string) => `${firstNameOf(fullName)}123`

/** Done means Venu got a spoken answer to both questions and they left a
 *  number for us. The transcript may be empty — a recording we can listen to
 *  is the thing being reviewed, and transcription is a convenience on top. */
export type Turn = {
  who: 'venu' | 'candidate'
  text: string
  ms?: number
  /** A panel the page shows under this line: the shifts, or the pay. */
  card?: 'shifts' | 'pay'
}

/** The interview transcript, kept inside `answers` so the conversation needs
 *  no column of its own. */
export function turnsOf(row: { answers?: any }): Turn[] {
  const t = row?.answers?.turns
  return Array.isArray(t) ? t : []
}

export function candidateIsComplete(row: { answers?: any; phone?: string | null }) {
  return Boolean(String(row.phone ?? '').trim()) &&
    turnsOf(row).some(t => t.who === 'candidate')
}
