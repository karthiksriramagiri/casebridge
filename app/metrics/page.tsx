import { redirect } from 'next/navigation'

/* The old combined dashboard. It split into creatives.case-bridge.com and
   finance.case-bridge.com; this keeps every bookmark and Slack link alive. */
export default function MetricsRedirect() {
  redirect('/creative')
}
