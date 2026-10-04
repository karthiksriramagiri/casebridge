import { hasAccess, currentRole, homeFor, NoAccess } from '@/app/_metrics/access'
import Client from './client'

/* Gated on the server so a page this account may not open is never sent to the
   browser at all — hiding the tab is a courtesy, this is the control. */
export default async function Page() {
  if (!(await hasAccess('/creative/competitors'))) {
    return <NoAccess home={homeFor(await currentRole())} />
  }
  return <Client />
}
