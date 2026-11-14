import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { WorkspacePicker } from "@/components/crm/workspace-picker"
import { CRM_ACCESS_COOKIE, CRM_DEMO_COOKIE, CRM_REFRESH_COOKIE } from "@/lib/crm-session"
import { isSupabaseConfigured } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Selecionar workspace",
}

export default async function WorkspacesPage() {
  const cookieStore = await cookies()
  const isDemo = cookieStore.get(CRM_DEMO_COOKIE)?.value === "1"
  const hasSession = Boolean(
    cookieStore.get(CRM_ACCESS_COOKIE)?.value || cookieStore.get(CRM_REFRESH_COOKIE)?.value,
  )
  if (!isDemo && !hasSession) redirect("/")

  return <WorkspacePicker demo={isDemo} backendConfigured={isSupabaseConfigured()} />
}
