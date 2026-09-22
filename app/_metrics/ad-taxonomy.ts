/* ═══════════════════════════════════════════════════════════════════════════
   Ad structure & hook taxonomy

   The rubric Claude classifies every ad against. It is deliberately a fixed
   list rather than something the model invents per run: consistency across
   runs is the whole point — a hook type that means one thing in March and
   another in April makes the frequency tables worthless.

   TAXONOMY_VERSION is stamped onto every scorecard. When the categories
   change, the version changes, and reports refuse to mix versions in one
   comparison rather than silently averaging incompatible labels.
   ═══════════════════════════════════════════════════════════════════════════ */

export const TAXONOMY_VERSION = '2026-09-mva-1'

/* ── Hooks: the first three seconds ─────────────────────────────────────── */

export const HOOK_TYPES = [
  { key: 'pattern_interrupt', label: 'Pattern interrupt', hint: 'Visually jarring or unexpected opening' },
  { key: 'bold_claim',        label: 'Bold claim / stat',  hint: 'A striking number or claim stated immediately' },
  { key: 'question',          label: 'Question',           hint: 'Opens with a direct question to the viewer' },
  { key: 'problem_callout',   label: 'Problem callout',    hint: 'Names the viewer\'s problem directly ("Just got in a car accident?")' },
  { key: 'social_proof',      label: 'Testimonial open',   hint: 'Starts mid-testimonial or with social proof' },
  { key: 'curiosity_gap',     label: 'Curiosity gap',      hint: 'Withholds the point to create intrigue' },
  { key: 'direct_offer',      label: 'Direct offer',       hint: 'Leads with the offer or CTA itself' },
  { key: 'ugc_native',        label: 'Native / UGC open',  hint: 'Looks like organic content, not an ad' },
] as const

/* ── Structure beats, in canonical order ────────────────────────────────── */

export const STRUCTURE_BEATS = [
  { key: 'hook',               label: 'Hook' },
  { key: 'problem_statement',  label: 'Problem / pain point' },
  { key: 'agitation',          label: 'Agitation' },
  { key: 'solution',           label: 'Solution introduction' },
  { key: 'proof',              label: 'Proof' },
  { key: 'offer_detail',       label: 'Offer detail' },
  { key: 'objection_handling', label: 'Objection handling' },
  { key: 'cta',                label: 'Call to action' },
  { key: 'urgency',            label: 'Urgency / scarcity' },
] as const

/* ── MVA / legal lead-gen specifics ─────────────────────────────────────────
   The generic starter taxonomy in the spec misses what this vertical actually
   runs on. These are the moves that show up in every personal-injury ad and
   that a general rubric would flatten into "offer detail".                  */

export const MVA_ELEMENTS = [
  { key: 'no_fee_unless_win',   label: 'No fee unless we win' },
  { key: 'free_consultation',   label: 'Free consultation' },
  { key: 'settlement_amount',   label: 'Named settlement figure' },
  { key: 'time_limit',          label: 'Statute-of-limitations urgency' },
  { key: 'not_at_fault',        label: 'Fault reassurance' },
  { key: 'no_insurance_needed', label: 'Works without insurance' },
  { key: 'medical_care_first',  label: 'Medical care / treatment offered' },
  { key: 'attorney_disclaimer', label: 'Attorney advertising disclaimer' },
  { key: 'case_type_callout',   label: 'Named case type (rear-end, rideshare, …)' },
  { key: 'state_targeting',     label: 'State or city named' },
] as const

/* ── Pacing & style ─────────────────────────────────────────────────────── */

export const CUT_FREQUENCY = ['fast', 'medium', 'slow'] as const       // <1s | 1–3s | 3s+
export const VISUAL_STYLE  = ['produced', 'ugc', 'mixed'] as const
export const SHOT_DOMINANCE = ['talking_head', 'b_roll', 'mixed'] as const
export const TEXT_DENSITY  = ['heavy', 'moderate', 'minimal'] as const

export type HookType = typeof HOOK_TYPES[number]['key']
export type BeatKey  = typeof STRUCTURE_BEATS[number]['key']

export const HOOK_LABEL: Record<string, string> =
  Object.fromEntries(HOOK_TYPES.map(h => [h.key, h.label]))
export const BEAT_LABEL: Record<string, string> =
  Object.fromEntries(STRUCTURE_BEATS.map(b => [b.key, b.label]))
export const MVA_LABEL: Record<string, string> =
  Object.fromEntries(MVA_ELEMENTS.map(m => [m.key, m.label]))

/* ── The JSON schema Claude must fill ───────────────────────────────────────
   Structured outputs enforce this shape, so a scorecard cannot come back
   malformed and no prose parsing is involved.                               */

export const SCORECARD_SCHEMA = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['hook', 'structure_beats_present', 'structure_beats_missing', 'pacing',
               'mva_elements', 'visual_timeline', 'notable_observations', 'confidence'],
    properties: {
      hook: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'verbatim_line_or_visual', 'timestamp_range', 'why'],
        properties: {
          type: { type: 'string', enum: HOOK_TYPES.map(h => h.key) },
          verbatim_line_or_visual: {
            type: 'string',
            description: 'The exact opening line if spoken, or a literal description of the opening visual. Quote, do not paraphrase.',
          },
          timestamp_range: { type: 'string', description: 'e.g. "0:00-0:03"' },
          why: { type: 'string', description: 'One sentence on why this hook type and not a neighbouring one.' },
        },
      },
      structure_beats_present: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['beat', 'timestamp', 'content_summary'],
          properties: {
            beat: { type: 'string', enum: STRUCTURE_BEATS.map(b => b.key) },
            timestamp: { type: 'string' },
            content_summary: { type: 'string' },
          },
        },
      },
      structure_beats_missing: {
        type: 'array',
        items: { type: 'string', enum: STRUCTURE_BEATS.map(b => b.key) },
      },
      pacing: {
        type: 'object',
        additionalProperties: false,
        required: ['cut_frequency', 'avg_shot_length_seconds', 'visual_style', 'shot_dominance', 'text_density'],
        properties: {
          cut_frequency: { type: 'string', enum: [...CUT_FREQUENCY] },
          avg_shot_length_seconds: { type: 'number' },
          visual_style: { type: 'string', enum: [...VISUAL_STYLE] },
          shot_dominance: { type: 'string', enum: [...SHOT_DOMINANCE] },
          text_density: { type: 'string', enum: [...TEXT_DENSITY] },
        },
      },
      mva_elements: {
        type: 'array',
        description: 'Which vertical-specific elements the ad uses. Omit any not present.',
        items: { type: 'string', enum: MVA_ELEMENTS.map(m => m.key) },
      },
      hook_to_first_cta_seconds: {
        type: ['number', 'null'],
        description: 'Seconds from start to the first ask for action. Null if the ad never asks.',
      },
      visual_timeline: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['timestamp_range', 'description', 'shot_type', 'on_screen_text'],
          properties: {
            timestamp_range: { type: 'string' },
            description: { type: 'string' },
            shot_type: { type: 'string' },
            on_screen_text: { type: 'string', description: 'Text visible on screen, verbatim. Empty string if none.' },
          },
        },
      },
      notable_observations: { type: 'string' },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'low when frames were unavailable or the transcript was empty — say so in notable_observations.',
      },
    },
  },
}
