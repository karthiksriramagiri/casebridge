import "dotenv/config";

const BASE = process.env.GHL_API_BASE || "https://services.leadconnectorhq.com";
const VERSION = process.env.GHL_API_VERSION || "2021-07-28";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
    Version: VERSION,
    "Content-Type": "application/json",
  };
}

async function ghlFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL API ${options.method || "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Fetch the contact record (name, phone, existing custom fields). */
export function getContact(contactId) {
  return ghlFetch(`/contacts/${contactId}`);
}

/** Find open conversations tied to this contact (SMS/email/FB/IG threads). */
export function searchConversations(contactId) {
  const params = new URLSearchParams({
    locationId: process.env.GHL_LOCATION_ID,
    contactId,
  });
  return ghlFetch(`/conversations/search?${params.toString()}`);
}

/** Pull the full message list (and attachment URLs) for one conversation thread. */
export function getMessages(conversationId) {
  return ghlFetch(`/conversations/${conversationId}/messages`);
}

/** List opportunities tied to this contact so we know which one to update. */
export function getOpportunitiesForContact(contactId) {
  const params = new URLSearchParams({
    location_id: process.env.GHL_LOCATION_ID,
    contact_id: contactId,
  });
  return ghlFetch(`/opportunities/search?${params.toString()}`);
}

/** Write extracted values onto the Contact's custom fields (merge, not replace). */
export function updateContactCustomFields(contactId, customFields) {
  return ghlFetch(`/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify({ customFields }),
  });
}

/** Write extracted values onto an Opportunity's custom fields. */
export function updateOpportunityCustomFields(opportunityId, customFields) {
  return ghlFetch(`/opportunities/${opportunityId}`, {
    method: "PUT",
    body: JSON.stringify({ customFields }),
  });
}

/** Drop the full structured summary onto the contact timeline for human review. */
export function addNote(contactId, body) {
  return ghlFetch(`/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/** Swap the "processing" tag out for a "ready for review" tag once done. */
export function updateTags(contactId, { add = [], remove = [] } = {}) {
  const calls = [];
  if (add.length) {
    calls.push(
      ghlFetch(`/contacts/${contactId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: add }),
      })
    );
  }
  if (remove.length) {
    calls.push(
      ghlFetch(`/contacts/${contactId}/tags`, {
        method: "DELETE",
        body: JSON.stringify({ tags: remove }),
      })
    );
  }
  return Promise.all(calls);
}

/** One-time helper: list every custom field defined in the sub-account (see scripts/list-custom-fields.js). */
export function listCustomFields() {
  return ghlFetch(`/locations/${process.env.GHL_LOCATION_ID}/customFields`);
}
