import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AppShell } from "@/components/crm/app-shell"
import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_REFRESH_COOKIE,
  CRM_WORKSPACE_COOKIE,
  CRM_WORKSPACE_NAME_COOKIE,
} from "@/lib/crm-session"

export const dynamic = "force-dynamic"

function decodeCookieValue(value: string | undefined, fallback: string) {
  if (!value) return fallback
  try {
    return decodeURIComponent(value)
  } catch {
    return fallback
  }
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const demo = cookieStore.get(CRM_DEMO_COOKIE)?.value === "1"
  const accessToken = cookieStore.get(CRM_ACCESS_COOKIE)?.value
  const hasAccessToken = Boolean(accessToken || cookieStore.get(CRM_REFRESH_COOKIE)?.value)
  const workspaceId = cookieStore.get(CRM_WORKSPACE_COOKIE)?.value

  if (!demo && !hasAccessToken) redirect("/")
  if (!workspaceId) redirect("/workspaces")

  const workspaceName = decodeCookieValue(
    cookieStore.get(CRM_WORKSPACE_NAME_COOKIE)?.value,
    "Workspace atual",
  )

  return (
    <AppShell key={workspaceId} demo={demo} workspaceId={workspaceId} workspaceName={workspaceName} needsInitialRefresh={!demo && !accessToken}>
      {children}
    </AppShell>
  )
}
