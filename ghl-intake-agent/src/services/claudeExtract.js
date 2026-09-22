import "dotenv/config";
import { INTAKE_FIELDS } from "../config/fields.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function buildSchemaInstructions() {
  return INTAKE_FIELDS.map(
    (f) => `- "${f.key}" (${f.type}): ${f.question}`
  ).join("\n");
}

/**
 * @param {string} transcriptText - concatenated SMS/email/call transcript text
 * @param {Array<{mediaType: string, data: string}>} images - base64 MMS images
 */
export async function extractIntakeFields(transcriptText, images = []) {
  const schema = buildSchemaInstructions();

  const systemPrompt = `You are an intake assistant for a law firm. You will be given the full \
text of a client's SMS/email conversation and call transcripts, plus any photos they sent \
(e.g. accident scenes, injuries, documents). Extract ONLY what is explicitly stated or clearly \
shown - never guess or infer a specific fact that wasn't communicated. If something isn't \
mentioned, use null (or "unknown" for case_type).

Respond with ONLY a raw JSON object, no markdown fences, no commentary, matching exactly these keys:
${schema}

Also include a "summary" key: a 4-6 sentence plain-English intake summary a paralegal can \
read in 15 seconds to decide if this is ready to send to the firm, and a "flags" key: an array \
of short strings for anything that needs human attention (missing info, inconsistent dates, \
possible red flags).`;

  const content = [{ type: "text", text: `CONVERSATION AND CALL TRANSCRIPTS:\n\n${transcriptText}` }];
  for (const img of images) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    });
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Claude did not return valid JSON. Raw output:\n${text}`);
  }
}
