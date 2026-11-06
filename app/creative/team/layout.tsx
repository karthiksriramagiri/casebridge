import { WorkspaceShell } from '@/app/creative/_components/workspace-shell'

/* Creative Team — Faisal workspace. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell role="creative">{children}</WorkspaceShell>
}
