const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY!
const FROM_EMAIL = 'info@case-bridge.com'
const FROM_NAME = 'CaseBridge'

export interface SendEmailParams {
  to: string
  toName: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY not set')
  }

  const body = {
    personalizations: [
      {
        to: [{ email: params.to, name: params.toName }],
        cc: [{ email: FROM_EMAIL, name: FROM_NAME }],
      },
    ],
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: params.subject,
    content: [
      ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
      { type: 'text/html', value: params.html },
    ],
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SendGrid error ${res.status}: ${text}`)
  }
}

// ── Firm-specific email templates ─────────────────────────────────────────────

interface QualifyEmailParams {
  firstName: string
  fullName: string
  firmName: string
  firmPhone: string
  firmEmail?: string
}

export function buildQualifyEmail(params: QualifyEmailParams): { subject: string; html: string; text: string } {
  const { firstName, fullName, firmName, firmPhone, firmEmail } = params

  const subject = `Your Case Has Been Accepted – ${firmName}`

  const text = `Hi ${firstName || fullName},

We're pleased to let you know that your case has been accepted by ${firmName}.

Our team will be in touch shortly to walk you through the next steps.

If you have any questions in the meantime, please don't hesitate to reach out:
Phone: ${firmPhone}${firmEmail ? `\nEmail: ${firmEmail}` : ''}

– The ${firmName} Team`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:28px 40px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${firmName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;color:#111;font-size:16px;">Hi ${firstName || fullName},</p>
              <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.6;">
                We're pleased to let you know that your case has been <strong>accepted</strong> by ${firmName}.
              </p>
              <p style="margin:0 0 32px;color:#333;font-size:15px;line-height:1.6;">
                Our team will be in touch shortly to walk you through the next steps.
              </p>
              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 24px;">
              <p style="margin:0 0 8px;color:#666;font-size:13px;">Questions? Reach us at:</p>
              <p style="margin:0 0 4px;color:#111;font-size:14px;font-weight:bold;">${firmPhone}</p>
              ${firmEmail ? `<p style="margin:0;color:#111;font-size:14px;">${firmEmail}</p>` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;color:#999;font-size:12px;">– The ${firmName} Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}

// Firm configs for qualify emails
export const FIRM_EMAIL_CONFIG: Record<string, { firmName: string; firmPhone: string; firmEmail?: string }> = {
  lhp: {
    firmName: 'The Law Offices of Larry H. Parker',
    firmPhone: '(562) 427-2044',
  },
  eisenberg: {
    firmName: 'Eisenberg Law Group PC',
    firmPhone: '(800) 350-8888',
  },
}
