// Venu — setter scoring.
//
// Two dimensions, nothing else: criteria qualification (the eight checkpoints
// plus the one nuance that decides the case) and empathy. The model never sees
// audio — only the transcript and the measured timing evidence.

import { z } from 'zod/v4'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { anthropic } from './anthropic'
import { CHECKPOINTS, EMPATHY_RUBRIC, TRAIT_THRESHOLDS, FOOTPRINT_STATES, STATE_GATE } from './rubrics'
import { describeMetrics, mmss } from './metrics'
import type { NuanceScenario } from './nuance-scenarios'
import { getLead } from './nuance-leads'
import type { Mode, SessionMetrics, SetterScorecard, Turn } from './types'

export const SetterScorecardSchema = z.object({
  stateGate: z.object({
    inFootprint: z.boolean().describe('Was the accident in a state the firm takes?'),
    confirmedByRep: z.boolean().describe('Did the rep actually ask and confirm the state out loud?'),
    turnsBeforeAsking: z.number().describe('How many rep turns passed before the state came up; 0 if never'),
    handledCorrectly: z.boolean(),
    note: z.string(),
  }),
  checkpoints: z.array(z.object({
    id: z.string(),
    label: z.string(),
    status: z.enum(['surfaced', 'incomplete', 'missed', 'not_applicable']),
    evidence: z.string().describe("The rep's actual words, or empty if never asked"),
    note: z.string(),
  })).describe('Exactly one entry per checkpoint, in rubric order'),
  nuance: z.object({
    caught: z.boolean(),
    detail: z.string().describe('The deciding detail, in plain language'),
    note: z.string().describe('How they surfaced it, or what they would have had to ask'),
  }),
  criteriaScore: z.number().describe('0-100'),
  empathy: z.object({
    score: z.number().describe('0-100'),
    evidence: z.array(z.string()).describe(
      'Moments where the caller did or did not feel cared for, quoting both sides. Never about pace or words per minute.'
    ),
    bestMoment: z.string().describe('The moment the rep made this caller feel most heard'),
    worstMoment: z.string().describe('The moment the caller most needed acknowledgement and did not get it'),
  }),
  overallScore: z.number().describe('0-100'),
  coachingSummary: z.string().describe('2-3 sentences, spoken directly to the rep'),
  doDifferentlyNextTime: z.array(z.string()).describe(
    '2-4 changes, each tied to a specific moment in this call. Either a checkpoint question that needed asking properly, or something to say to make this caller feel cared for. Never about pace or speaking rate.'
  ),
  flaggedMoments: z.array(z.object({
    timestamp: z.string(), issue: z.string(), evidence: z.string(),
  })),
})

function transcriptText(turns: Turn[]): string {
  return turns
    .map((t) => `[${mmss(t.startMs)}] ${t.speaker === 'rep' ? 'REP' : 'CALLER'}: ${t.text}`)
    .join('\n')
}

export async function scoreSetterSession(opts: {
  scenario: NuanceScenario
  turns: Turn[]
  metrics: SessionMetrics
  endReason: string
  mode: Mode
}): Promise<SetterScorecard> {
  const { scenario, turns, metrics, endReason, mode } = opts

  const system = `You are the scoring engine for Venu, the intake-setter training system for a
motor-vehicle-accident case generation business. You grade one practice call.

BEFORE ANYTHING ELSE — THE STATE GATE
${STATE_GATE.rule}
The firm currently works in: ${FOOTPRINT_STATES.join(', ')}.

This changes how the whole call is scored:

- IF THE ACCIDENT IS OUT OF STATE, the call is correctly over as soon as the rep
  establishes that. A rep who asks the state early, confirms it, tells the caller plainly
  and kindly, and ends the call has done the RIGHT thing and should score well on criteria
  — even though seven of the eight checkpoints were never asked. Mark those checkpoints
  "not_applicable", not "missed". Do not ask for the date, the story, the insurance or the
  treatment on a case that is already dead.
  The failures to penalise on an out-of-state call are: taking a long time to get to the
  state question, never confirming it out loud, or continuing to collect details after
  learning it is out of state. That last one is wasted time for the rep and the caller,
  and it should cost them.
- IF THE ACCIDENT IS IN FOOTPRINT, score the eight checkpoints as normal, and treat a rep
  who never confirmed the state at all as having left a gate unchecked.

Doing it right: ${STATE_GATE.rightWay.join(' | ')}
Doing it wrong: ${STATE_GATE.wrongWay.join(' | ')}

Setter calls are otherwise scored on exactly TWO things. Do not grade anything else.

1. CRITERIA QUALIFICATION — did the rep surface all eight checkpoints, and did they
   surface the one detail that actually decides this case?
${CHECKPOINTS.map((c, i) => `   ${i + 1}. ${c.id} (${c.label})
        complete: ${c.complete}
        counts as incomplete: ${c.incomplete.join('; ')}`).join('\n')}

2. EMPATHY — ${EMPATHY_RUBRIC.definition}
   Reads as empathetic: ${EMPATHY_RUBRIC.positive.join(' | ')}
   Reads as cold: ${EMPATHY_RUBRIC.negative.join(' | ')}
   Timing signals: ${EMPATHY_RUBRIC.timing.join(' | ')}
   Delivery signals (measured from the microphone): ${EMPATHY_RUBRIC.delivery.join(' | ')}
   Thresholds: ${JSON.stringify(TRAIT_THRESHOLDS)}

Rules:
- Score ONLY what is in the transcript. Never assume a question was asked because it
  usually is. If the rep never asked, the checkpoint is missed — no benefit of the doubt.
- Quote the rep's actual words as evidence. A score with no quotes is worthless.
- "surfaced" means the rep asked AND got a complete answer. Asking is not enough. If they
  asked but accepted a vague answer without following up, that is "incomplete", not
  "surfaced" — and the note must say what the follow-up should have been, in words.
- For anything not fully surfaced, the note is the most useful thing on the scorecard:
  say exactly what was missing and what question would have got it.
- The timing and delivery metrics are real measurements, not impressions. Use them for
  empathy — talk ratio, speaking rate, how fast the rep moved on after an emotional
  disclosure, and where their delivery departed from their own vocal baseline.
- Delivery is only meaningful next to the words. "Went flat and quiet" is warmth if it
  follows bad news and coldness if it follows a question the rep found tedious. Say which
  you think it is and why. If the audio and the words disagree, trust the words and say
  so.
- criteriaScore, in footprint: weight the eight checkpoints evenly, then apply the
  nuance. Missing the deciding detail should cost roughly a quarter of the criteria score
  even if all eight checkpoints were touched — that detail is the whole point of the call.
- criteriaScore, OUT of footprint: the eight checkpoints are irrelevant. Score how well
  the gate was handled — how quickly the state was established, whether it was confirmed
  rather than assumed, whether the rep closed cleanly instead of grinding on. A rep who
  caught it in the first minute and ended the call politely should score high, in the 80s
  or better. Do not mark them down for the questions they correctly did not ask.
- overallScore: criteria and empathy both matter. Weight criteria 65 / empathy 35.
- Be specific and useful, not encouraging. A generous score costs this rep money on real
  calls. Do not invent faults either.

WHAT COACHING IS FOR — and what it is not
Every piece of advice you give must be one of exactly two things:
  (a) a question from the checkpoint list that was not asked, or was asked and left
      half-answered, and what asking it properly sounds like; or
  (b) something concrete the rep could have said or done to make this caller feel cared
      for at a specific moment in this call.

Do NOT coach on:
  - Speaking rate, words per minute, pace, or how fast they talked. It is not what makes
    someone feel cared for, and it is not something a rep can act on mid-call.
  - Invented best-practice questions that are not on the checkpoint list. If a question
    is not in the rubric, it is not this rep's job today.
  - Call structure, scripts, openers, or general sales technique.
  - Anything phrased as a habit or a rule. Point at the moment in THIS call.

Each item in doDifferentlyNextTime must quote or reference the actual moment it is about,
and say what to do instead in words the rep could say out loud.
- coachingSummary speaks to the rep in second person.
- Return exactly ${CHECKPOINTS.length} checkpoint entries, using these ids in this order:
  ${CHECKPOINTS.map((c) => c.id).join(', ')}.`

  const lead = getLead(scenario.id)
  const accidentState = lead?.state ?? 'CA'
  const inFootprint = FOOTPRINT_STATES.includes(accidentState)
  const leadBlock = lead
    ? `THE FORM THE REP HAD ON SCREEN (submitted by the client before the call):
  Name: ${lead.firstName} ${lead.lastName} | Phone: ${lead.phone} | State: ${lead.state}
  Accident: ${lead.accidentWindow} | Lawyer already handling: ${lead.lawyerHandling}
  Injury: ${lead.injuryOption} | At fault: ${lead.atFault}
  The rep knew the name already, so "right person" is about confirming they have the
  correct person on the line and establishing that person's role in the accident — not
  about asking who they are from scratch. Self-reported form answers are frequently wrong;
  credit the rep for checking them against what the caller actually says.
`
    : ''

  const user = `MODE: ${mode}${mode === 'test' ? ' (graded test — the rep had no checklist on screen)' : ' (practice)'}

${leadBlock}
STATE OF THE ACCIDENT: ${accidentState} — ${inFootprint ? 'IN footprint, so the eight checkpoints apply in full.' : 'OUT of footprint, so this case is an instant disqualification and the only thing that matters is how quickly and cleanly the rep established that.'}

THE CASE VENU WAS PLAYING (ground truth the rep could not see):
Title: ${scenario.title}
Category: ${scenario.category}
Book disposition: ${scenario.disposition.replace('_', ' ')}

Full fact pattern:
${scenario.story}

THE DECIDING DETAIL (this is what "nuance caught" means — did the rep's questions
actually surface this, or did they run past it?):
${scenario.nuance}

Why the book reaches its disposition:
${scenario.reason}

How the call ended: ${endReason}

TIMING EVIDENCE (measured, not estimated):
${describeMetrics(metrics)}

TRANSCRIPT:
${transcriptText(turns)}`

  const client = anthropic()
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 16000,
    output_config: {
      // Benchmarked against 'high' on the same call: 31s vs 41s, with overall,
      // criteria and empathy all within three points and the deciding detail
      // caught either way. The extra ten seconds of thinking was not buying a
      // better scorecard, and the rep is sitting watching a spinner for it.
      effort: 'medium',
      // The SDK helper is implemented against zod v4 but still types its
      // parameter as v3's ZodType; the return type below enforces the shape.
      format: zodOutputFormat(SetterScorecardSchema as any),
    },
    system,
    messages: [{ role: 'user', content: user }],
  })

  // Cost visibility — scoring is the expensive half of a session.
  console.log('[venu:score] usage', JSON.stringify(response.usage))

  if (!response.parsed_output) throw new Error('Scorer returned no parsable scorecard')
  const card = response.parsed_output as SetterScorecard

  // Pin the checkpoint list to the rubric. The model occasionally pads the
  // array with a filler row or drifts on a label; the result page renders
  // whatever it gets, so normalise to exactly the eight, in rubric order.
  const returned = new Map(card.checkpoints.map((c) => [c.id, c]))
  card.checkpoints = CHECKPOINTS.map((def) => {
    const got = returned.get(def.id)
    return {
      id: def.id,
      label: def.label,
      status: got?.status ?? 'missed',
      evidence: got?.evidence ?? '',
      note: got?.note ?? 'The scorer did not report on this checkpoint.',
    }
  })

  return card
}
