import { redirect } from 'next/navigation'
import { AssignmentsClient } from './client'

/* Assignments currently lives in Notion. With the workspace URL configured
   this route is a doorway to it rather than a page — the header links
   straight there, and this covers the bookmark and the typed URL. Unset the
   variable and the in-app board comes back untouched. */

const NOTION = process.env.NEXT_PUBLIC_NOTION_ASSIGNMENTS_URL

export default function AssignmentsPage() {
  if (NOTION) redirect(NOTION)
  return <AssignmentsClient />
}
