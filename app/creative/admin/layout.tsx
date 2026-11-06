import { WorkspaceShell } from '@/app/creative/_components/workspace-shell'

/* Admin — Jason workspace. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell role="admin">{children}</WorkspaceShell>
}
