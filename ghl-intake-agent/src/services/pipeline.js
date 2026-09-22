import "dotenv/config";
import * as ghl from "./ghlClient.js";
import * as tw from "./twilioClient.js";
import { extractIntakeFields } from "./claudeExtract.js";
import { INTAKE_FIELDS, SUMMARY_NOTE_TITLE } from "../config/fields.js";

async function downloadAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const mediaType = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { mediaType, data: buf.toString("base64") };
}

/** Pull every SMS/email message + image attachment across all of a contact's conversation threads. */
async function collectConversationData(contactId) {
  const { conversations = [] } = await ghl.searchConversations(contactId);
  let transcript = "";
  const images = [];

  for (const convo of conversations) {
    const { messages = [] } = await ghl.getMessages(convo.id);
    for (const msg of messages.reverse()) {
      const who = msg.direction === "inbound" ? "Client" : "Firm/Agent";
      const when = msg.dateAdded || "";
      if (msg.body) transcript += `[${when}] ${who}: ${msg.body}\n`;

      for (const att of msg.attachments || []) {
        const url = typeof att === "string" ? att : att.url;
        if (!url) continue;
        if (/\.(jpe?g|png|webp|gif)$/i.test(url)) {
          const img = await downloadAsBase64(url);
          if (img) images.push(img);
        }
      }
    }
  }
  return { transcript, images };
}

/** Pull Twilio in-house dialer call transcripts for this contact's phone number. */
async function collectCallTranscripts(phone) {
  if (!phone) return "";
  const calls = await tw.findCallsForNumber(phone);
  let text = "";
  for (const call of calls) {
    const t = await tw.getCallTranscript(call);
    if (t) {
      text += `\n[Call ${call.startTime}, ${call.direction}, duration ${call.duration}s]\n${t}\n`;
    }
  }
  return text;
}

function splitByTarget(extracted) {
  const contactFields = [];
  const opportunityFields = [];
  for (const f of INTAKE_FIELDS) {
    const value = extracted[f.key];
    if (value === undefined || value === null || value === "") continue;
    const entry = { id: f.ghlFieldId, value };
    if (f.target === "opportunity") opportunityFields.push(entry);
    else contactFields.push(entry);
  }
  return { contactFields, opportunityFields };
}

function formatNote(extracted) {
  const lines = [`**${SUMMARY_NOTE_TITLE}**`, "", extracted.summary || "(no summary generated)"];
  if (extracted.flags?.length) {
    lines.push("", "**Needs attention:**");
    for (const flag of extracted.flags) lines.push(`- ${flag}`);
  }
  lines.push("", "**Extracted fields:**");
  for (const f of INTAKE_FIELDS) {
    lines.push(`- ${f.key}: ${extracted[f.key] ?? "(not found)"}`);
  }
  return lines.join("\n");
}

/**
 * Full pipeline for one contact: gather -> extract -> write back -> flag for review.
 * Never sends anything to the firm itself - only fills fields and drops a note,
 * per the "review before send" requirement.
 */
export async function runIntakeForContact(contactId) {
  const contact = await ghl.getContact(contactId);
  const phone = contact.contact?.phone;

  const [{ transcript: convoTranscript, images }, callTranscript] = await Promise.all([
    collectConversationData(contactId),
    collectCallTranscripts(phone),
  ]);

  const fullTranscript = `${convoTranscript}\n${callTranscript}`.trim();
  if (!fullTranscript && images.length === 0) {
    throw new Error(`No conversation or call data found for contact ${contactId}`);
  }

  const extracted = await extractIntakeFields(fullTranscript, images);
  const { contactFields, opportunityFields } = splitByTarget(extracted);

  if (contactFields.length) {
    await ghl.updateContactCustomFields(contactId, contactFields);
  }

  if (opportunityFields.length) {
    const { opportunities = [] } = await ghl.getOpportunitiesForContact(contactId);
    if (opportunities.length) {
      // Updates the most recently created/updated open opportunity.
      await ghl.updateOpportunityCustomFields(opportunities[0].id, opportunityFields);
    } else {
      console.warn(`No opportunity found for contact ${contactId}; opportunity fields were skipped.`);
    }
  }

  await ghl.addNote(contactId, formatNote(extracted));

  await ghl.updateTags(contactId, {
    add: [process.env.DONE_TAG || "intake-ready-for-review"],
    remove: [process.env.SIGNED_TAG || "signed-case"],
  });

  return extracted;
}
