import { z } from "zod"

import { getSupabaseUserId } from "@/lib/supabase-auth-user"
import { supabaseRequest } from "@/lib/supabase-server"

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "manager"
  | "sales"
  | "marketing"
  | "finance"
  | "support"
  | "viewer"

export type WorkspaceMemberContext = {
  userId: string
  role: WorkspaceRole
  status: "active"
}

const roleSchema = z.enum([
  "owner",
  "admin",
  "manager",
  "sales",
  "marketing",
  "finance",
  "support",
  "viewer",
])

export async function getWorkspaceMemberContext(
  accessToken: string,
  workspaceId: string,
): Promise<WorkspaceMemberContext | null> {
  const userId = await getSupabaseUserId(accessToken)
  if (!userId) return null

  const response = await supabaseRequest(
    `/rest/v1/workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=role,status&limit=1`,
    {},
    accessToken,
  )

  if (!response.ok) return null
  const rows = (await response.json().catch(() => [])) as Array<{
    role?: unknown
    status?: unknown
  }>
  const parsed = roleSchema.safeParse(rows[0]?.role)
  if (!parsed.success || rows[0]?.status !== "active") return null

  return { userId, role: parsed.data, status: "active" }
}

export function canOperateIntake(role: WorkspaceRole) {
  return role !== "viewer"
}

export function canRetryNotification(role: WorkspaceRole) {
  return role === "owner" || role === "admin" || role === "manager"
}
