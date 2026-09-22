/**
 * This is the ONE file you customize per firm/pipeline.
 *
 * `key`         -> what Claude will put in its JSON output (keep these stable)
 * `question`    -> plain-English instruction for the extraction prompt
 * `ghlFieldId`  -> the actual custom field ID from your GHL sub-account
 * `target`      -> "contact" or "opportunity" - where this field lives in GHL
 * `type`        -> hint for Claude on expected format ("text","date","number","select")
 *
 * Run `npm run list-fields` after setting GHL_LOCATION_ID + GHL_API_TOKEN in .env
 * to print every custom field ID in your account, then paste the right ones in below.
 * Placeholder IDs below (xxxxxxxxxxxxxxxxxxxxxxxx) WILL fail until replaced.
 */

export const INTAKE_FIELDS = [
  {
    key: "case_type",
    question: "The type of case/claim (e.g. auto accident, slip and fall, workers comp, medical malpractice). Use 'unknown' if not stated.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "opportunity",
    type: "text",
  },
  {
    key: "incident_date",
    question: "Date the incident occurred, in YYYY-MM-DD. Use null if never mentioned.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "contact",
    type: "date",
  },
  {
    key: "incident_location",
    question: "City/state or address where the incident happened, as specifically as stated.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "contact",
    type: "text",
  },
  {
    key: "injury_description",
    question: "Summary of the injuries or damages described by the client, in their own terms where possible.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "contact",
    type: "text",
  },
  {
    key: "medical_treatment",
    question: "Any medical treatment mentioned: ER visit, hospital name, ongoing care, upcoming appointments.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "contact",
    type: "text",
  },
  {
    key: "insurance_carrier",
    question: "The at-fault party's or client's insurance carrier name, if mentioned.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "opportunity",
    type: "text",
  },
  {
    key: "policy_or_claim_number",
    question: "Any insurance policy or claim number mentioned.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "opportunity",
    type: "text",
  },
  {
    key: "at_fault_party",
    question: "Name of the other party/parties involved, if mentioned.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "opportunity",
    type: "text",
  },
  {
    key: "witnesses",
    question: "Any witness names or contact info mentioned.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "contact",
    type: "text",
  },
  {
    key: "red_flags",
    question: "Anything that could hurt the case: gaps in treatment, prior similar claims, comparative fault admissions, missed deadlines, statute of limitations concerns.",
    ghlFieldId: "xxxxxxxxxxxxxxxxxxxxxxxx",
    target: "opportunity",
    type: "text",
  },
];

// Note left on the Contact timeline for the human reviewer - always written
// in full regardless of which individual fields above succeed/fail.
export const SUMMARY_NOTE_TITLE = "Intake Summary (auto-drafted - review before sending to firm)";
