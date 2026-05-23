import { NextResponse } from "next/server";

const SLACK_WEBHOOK_URL =
  "https://hooks.slack.com/services/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";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, firmName, message } = body;

    const slackMessage = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "New Lead Inquiry from Case Bridge",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Name:*\n${firstName} ${lastName}`,
            },
            {
              type: "mrkdwn",
              text: `*Firm:*\n${firmName || "Not provided"}`,
            },
            {
              type: "mrkdwn",
              text: `*Email:*\n${email}`,
            },
            {
              type: "mrkdwn",
              text: `*Phone:*\n${phone || "Not provided"}`,
            },
          ],
        },
        ...(message
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Message:*\n${message}`,
                },
              },
            ]
          : []),
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Submitted at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
            },
          ],
        },
      ],
    };

    const slackResponse = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage),
    });

    if (!slackResponse.ok) {
      return NextResponse.json(
        { error: "Failed to send notification" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
