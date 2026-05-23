// Firm-specific NR tags that are eligible for bot enrollment.
// Only contacts with one of these exact tags will be enrolled.
const ELIGIBLE_NR_TAGS = new Set(["lhp_nr", "eb_nr", "thl_nr"])

// For each firm, the ONLY tags a contact may have for the bot to send messages.
// Any tag outside this set means the contact has been assigned another status — do not send.
const FIRM_ALLOWED_TAGS = {
  lhp_nr: new Set(["lhp", "lhp_nr"]),
  eb_nr:  new Set(["eb",  "eb_nr"]),
  thl_nr: new Set(["thl", "thl_nr"]),
}

function normalizeSingleTag(tag) {
  return String(tag)
    .toLowerCase()
    .trim()
    .replace(/^#/, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

function normalizeTagList(tags) {
  if (!tags) return []
  if (Array.isArray(tags)) return tags.flatMap(normalizeTagList)
  if (typeof tags === "object") return normalizeTagList(Object.values(tags))
  // Split on commas only — preserve compound tags like "lhp - nr" as a single unit
  return String(tags)
    .split(/,/)
    .map(normalizeSingleTag)
    .filter(Boolean)
}

function hasNoResponseTag(payload = {}) {
  const tagSources = [
    payload.tags,
    payload.tag,
    payload.contactTags,
    payload.contact?.tags,
    payload.contact?.tag,
    payload.customData?.tags,
    payload.customData?.tag,
    payload.customData?.contactTags,
  ]
  return tagSources.some((tags) =>
    normalizeTagList(tags).some((t) => ELIGIBLE_NR_TAGS.has(t))
  )
}

function isNoResponseSignal(payload = {}) {
  // Must have one of the firm-specific NR tags — bare "NR" disposition alone is not enough
  return hasNoResponseTag(payload)
}

// Returns true only if every tag on the contact belongs to their firm's allowed set.
// Any extra tag means another disposition/status has been applied — block sending.
function hasOnlyFirmTags(contact) {
  const tags = normalizeTagList(contact.tags)
  if (!tags.length) return false

  // Find which firm this contact belongs to
  const firmNrTag = tags.find((t) => ELIGIBLE_NR_TAGS.has(t))
  if (!firmNrTag) return false

  const allowed = FIRM_ALLOWED_TAGS[firmNrTag]
  return tags.every((t) => allowed.has(t))
}

module.exports = {
  ELIGIBLE_NR_TAGS,
  FIRM_ALLOWED_TAGS,
  normalizeTagList,
  normalizeSingleTag,
  hasNoResponseTag,
  isNoResponseSignal,
  hasOnlyFirmTags,
}
