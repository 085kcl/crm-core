import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { supabaseAdminRequest } from "@/lib/supabase-admin"
import { getSupabaseUserId } from "@/lib/supabase-auth-user"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ statusId: string }> }

const updateSchema = z.object({
  label: z.string().trim().min(1).max(120),
  position: z.number().int().nonnegative(),
  is_terminal: z.boolean(),
  customer_notification_enabled: z.boolean(),
  active: z.boolean(),
  inbox_bucket: z.enum(["new", "in_progress", "awaiting_customer", "closed"]),
}).strict()

function message(text: string, status: number) {
  return NextResponse.json({ message: text }, { status })
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return rejectedMutation()

  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const statusId = (await context.params).statusId

  if (
    !z.string().uuid().safeParse(workspaceId).success ||
    !z.string().uuid().safeParse(statusId).success
  ) {
    return message("Status não encontrado.", 404)
  }

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return message("A demonstração é somente leitura.", 403)
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return message("Revise os dados do status.", 400)

  if (parsed.data.is_terminal && parsed.data.inbox_bucket !== "closed") {
    return message("Status terminal deve pertencer à categoria Concluídas.", 400)
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)
  const userId = await getSupabaseUserId(token)
  if (!userId) return message("Sessão expirada.", 401)

  const response = await supabaseAdminRequest(
    "/rest/v1/rpc/update_intake_status_config_service",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_workspace_id: workspaceId,
        p_status_id: statusId,
        p_actor_user_id: userId,
        p_label: parsed.data.label,
        p_position: parsed.data.position,
        p_is_terminal: parsed.data.is_terminal,
        p_customer_notification_enabled: parsed.data.customer_notification_enabled,
        p_active: parsed.data.active,
        p_inbox_bucket: parsed.data.inbox_bucket,
      }),
    },
  )

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null
    const providerMessage = detail?.message || ""

    if (providerMessage.includes("not_authorized")) {
      return message("Seu papel não permite configurar status.", 403)
    }
    if (providerMessage.includes("initial_status_must_remain")) {
      return message("O status inicial precisa permanecer ativo e não terminal.", 409)
    }
    if (providerMessage.includes("intake_status_not_found")) {
      return message("Status não encontrado.", 404)
    }
    return message("Não foi possível atualizar o status.", 502)
  }

  return NextResponse.json({ saved: true })
}
