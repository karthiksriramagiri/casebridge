// Venu — setter rubrics.
//
// Setter training scores exactly two things: criteria qualification (did the
// rep surface every checkpoint, and the one detail that decides the case) and
// empathy (did the caller feel heard while it happened).
//
// The eight checkpoints are the Nuance Book's own framework — "right person,
// accident date, the story, fault, police report/insurance, injuries,
// treatment, property damage" — so a rep who scores well here is running the
// call the way the book teaches it.

/**
 * States the firm currently takes cases in.
 *
 * This gates everything. An accident outside the footprint is an immediate
 * disqualification no matter how good the facts are, so the state comes before
 * the eight checkpoints — and once it comes back out of state, the remaining
 * checkpoints are not just unnecessary, they are wasted time on a call that
 * should already be over.
 */
export const FOOTPRINT_STATES = ['CA']

export const STATE_GATE = {
  rule: 'The accident must have happened in California. Anywhere else is an instant no, regardless of liability, injuries, insurance or treatment.',
  rightWay: [
    'Establish the state early — within the first minute, before working through the story.',
    'The form is self-reported, so confirm it out loud rather than trusting the field.',
    'Out of state: say so plainly, kindly, and close. Do not collect the rest.',
    'Leave them with a next step rather than just ending — they still had an accident.',
  ],
  wrongWay: [
    'Working through injuries, treatment, insurance and damage before ever asking where it happened.',
    'Continuing to take details after learning it is out of state — that is wasted time on both sides.',
    'Treating the form\'s state field as confirmed without asking.',
  ],
}

export interface Checkpoint {
  id: string
  label: string
  /** What a complete answer covers. */
  complete: string
  /** Answers that sound sufficient but are not. */
  incomplete: string[]
}

export const CHECKPOINTS: Checkpoint[] = [
  {
    id: 'right_person',
    label: 'Right person',
    complete:
      'Confirms who they are speaking to and whether that person is the injured party — not a spouse, parent, friend, or someone calling on behalf of a passenger.',
    incomplete: ['Takes the story without ever establishing whose accident it was', 'Assumes the caller is the injured party'],
  },
  {
    id: 'accident_date',
    label: 'Accident date',
    complete: 'A specific date, or month and year — enough to judge the statute window and treatment timing.',
    incomplete: ['"a while back"', '"a few months ago"', 'a season with no year'],
  },
  {
    id: 'the_story',
    label: 'The story',
    complete:
      'A coherent account of the collision: direction of travel, who hit who, where on the vehicle, road and light conditions. Enough to picture it.',
    incomplete: ['One clause with no mechanism', '"He hit me" with no sequence of events'],
  },
  {
    id: 'fault',
    label: 'Fault',
    complete:
      'Who caused it and how it is established — admission, citation, witness, or the physical facts. Including whether the caller has any share of it.',
    incomplete: ['"It was the other guy" with nothing behind it', 'Never probes the caller\'s own contribution'],
  },
  {
    id: 'police_insurance',
    label: 'Police report & insurance',
    complete:
      'Whether police responded and a report exists (number/department if available), plus insurance on both sides — the defendant\'s coverage to pursue, and the caller\'s own policy status.',
    incomplete: ['"The cops came" with no report detail', 'Only one side\'s insurance captured', 'Never asks whether the caller\'s own policy was active'],
  },
  {
    id: 'injuries',
    label: 'Injuries',
    complete: 'Named body parts and symptoms, and whether they are ongoing — not just "I\'m sore".',
    incomplete: ['"banged up"', '"I\'m fine now"', 'Accepts a vague answer without asking where it hurts'],
  },
  {
    id: 'treatment',
    label: 'Treatment',
    complete:
      'Where they were seen, how soon after the accident, whether treatment is ongoing, and any gap in care.',
    incomplete: ['"I went to the ER" with no follow-up about since then', 'Never establishes how many days passed before first treatment'],
  },
  {
    id: 'property_damage',
    label: 'Property damage',
    complete: 'Damage described, and where the vehicle is now. Supports the severity of impact.',
    incomplete: ['"It got hit" with no description', 'Never asked at all'],
  },
]

// ── Empathy ───────────────────────────────────────────────────────────────
export const EMPATHY_RUBRIC = {
  definition:
    'Does the caller feel heard? Validation before extraction, pacing matched to their state, and acknowledgement of what they just said before the next question. A setter who gets all eight checkpoints by interrogation has failed half this call.',
  positive: [
    'Names the emotion or the hardship ("that sounds like it was really scary", "I\'m sorry, that\'s a lot to deal with").',
    'Reflects back a specific detail the caller gave, rather than a generic "okay".',
    'Softens the harder questions instead of firing them ("I know this part is tedious, but it matters for your case").',
    'Lets the caller finish, and gives them room when they are upset.',
    'Explains why an intrusive question is being asked.',
  ],
  negative: [
    'Questions fired one after another with no acknowledgement between them.',
    'Moves straight to the next field after an emotional disclosure.',
    'Generic filler ("okay", "got it", "mhm") as the only response to distress.',
    'Interrupts, or talks over the caller.',
    'Corrects or argues with the caller about their own experience.',
  ],
  // Named "timing", not "acoustic", on purpose: none of these come from the
  // audio signal. They are derived from word timestamps. Nothing in Venu
  // currently measures pitch, loudness, or voice quality — a warm line read
  // in a flat monotone scores the same as one that is meant.
  //
  // Speaking rate was deliberately removed. It produced coaching about words
  // per minute, which is not what makes a caller feel cared for and is not
  // something a rep can act on mid-call.
  timing: [
    'A reply that lands in under 300ms right after an emotional disclosure reads as not listening — the rep was waiting, not hearing.',
    'A rep talking more than about half a setter call is not letting the caller speak.',
    'Cutting in before the caller finishes.',
  ],
  // Measured from the microphone, expressed against the rep's own baseline for
  // the call. Deliberately relative: absolute pitch variability does NOT track
  // warmth — a clipped "Okay. Got it. And the date?" measures as more variable
  // than a warm "I'm so sorry, that sounds scary", because terse sentences are
  // full of final falls. Thresholds here are starting values and want
  // calibration against real reps.
  delivery: [
    'Delivery flattening on the turn right after the caller disclosed something is worth naming — it is the moment they stop feeling heard.',
    'Read every delivery shift against what was said at the time, never on its own.',
    'Never score the absolute numbers. Only the departures from this rep\'s own baseline.',
  ],
}

export const TRAIT_THRESHOLDS = {
  hesitationGapMs: 2000,
  crispGapMs: 700,
  repTalkRatioRange: [0.3, 0.55] as [number, number],
  monologueSec: 45,
}

export const MODE_LABELS = {
  practice: 'Practice',
  test: 'Test',
} as const

export type Mode = keyof typeof MODE_LABELS
