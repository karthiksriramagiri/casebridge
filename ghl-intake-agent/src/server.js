import "dotenv/config";
import express from "express";
import { runIntakeForContact } from "./services/pipeline.js";

const app = express();
app.use(express.json());

app.post("/webhooks/ghl/signed-case", async (req, res) => {
  // Simple shared-secret check - set the same value as a custom header
  // in the GHL workflow's Webhook action so random internet traffic can't trigger this.
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.WEBHOOK_SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const contactId = req.body.contactId || req.body.contact_id;
  if (!contactId) {
    return res.status(400).json({ error: "contactId missing from payload" });
  }

  // Respond immediately so GHL's workflow doesn't time out, then process
  // in the background - GHL webhooks typically expect a fast 200.
  res.status(202).json({ status: "processing", contactId });

  try {
    const result = await runIntakeForContact(contactId);
    console.log(`Intake complete for ${contactId}:`, result.summary);
  } catch (err) {
    console.error(`Intake failed for ${contactId}:`, err);
    // TODO: swap this for a Slack/email alert so a failure doesn't sit silently -
    // e.g. post to a Slack webhook URL here with the contactId and err.message.
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`GHL intake agent listening on :${port}`));
