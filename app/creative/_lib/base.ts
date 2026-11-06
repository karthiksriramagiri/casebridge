import { headers } from 'next/headers'
import { siteRootForHost } from '@/app/_metrics/site-root'

/* The browser-facing prefix for this host, for server-side redirect() calls.
   redirect() writes a Location header the browser follows literally, so it
   needs the path as the browser sees it: bare on creatives.case-bridge.com,
   /creative-prefixed on the apex. Client components get the same answer from
   useSite().base. */
export async function centerBase(): Promise<string> {
  return siteRootForHost((await headers()).get('host')) === '/creative' ? '' : '/creative'
}
