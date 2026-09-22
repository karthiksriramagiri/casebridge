import "dotenv/config";
import twilio from "twilio";

const client =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

/**
 * Find calls to/from this phone number so we can pull transcripts for calls
 * that happened outside of GHL's own conversation log (your in-house dialer).
 * `phone` should be E.164, e.g. +14045551234.
 */
export async function findCallsForNumber(phone, { limit = 20 } = {}) {
  if (!client) return [];
  const [inbound, outbound] = await Promise.all([
    client.calls.list({ from: phone, limit }),
    client.calls.list({ to: phone, limit }),
  ]);
  return [...inbound, ...outbound].sort(
    (a, b) => new Date(b.startTime) - new Date(a.startTime)
  );
}

/**
 * Get the transcript text for a call.
 *
 * Two paths, pick the one that matches your Twilio setup:
 *  1) Twilio Voice Intelligence (recommended) - if TWILIO_INTELLIGENCE_SERVICE_SID
 *     is set, this reads the already-generated transcript.
 *  2) Legacy Recording Transcriptions sub-resource - lower quality, being
 *     deprecated by Twilio, kept here as a fallback.
 *
 * If neither is configured, this returns null and the call is skipped -
 * plug in a different STT provider here (e.g. Deepgram, AssemblyAI) if you
 * don't use either Twilio option.
 */
export async function getCallTranscript(call) {
  if (!client) return null;

  if (process.env.TWILIO_INTELLIGENCE_SERVICE_SID) {
    try {
      const transcripts = await client.intelligence.v2.transcripts.list({
        sourceSid: call.sid,
        limit: 1,
      });
      if (transcripts.length) {
        const sentences = await client.intelligence.v2
          .transcripts(transcripts[0].sid)
          .sentences.list();
        return sentences.map((s) => `${s.speaker || "speaker"}: ${s.transcript}`).join("\n");
      }
    } catch (err) {
      console.warn(`Voice Intelligence lookup failed for call ${call.sid}:`, err.message);
    }
  }

  try {
    const recordings = await client.calls(call.sid).recordings.list({ limit: 1 });
    if (!recordings.length) return null;
    const transcriptions = await client
      .recordings(recordings[0].sid)
      .transcriptions.list({ limit: 1 });
    return transcriptions[0]?.transcriptionText || null;
  } catch (err) {
    console.warn(`Recording transcription lookup failed for call ${call.sid}:`, err.message);
    return null;
  }
}
