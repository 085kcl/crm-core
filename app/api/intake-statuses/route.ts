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
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,62}$/),
  label: z.string().trim().min(1).max(120),
  position: z.number().int().nonnegative(),
  is_terminal: z.boolean(),
  customer_notification_enabled: z.boolean(),
  active: z.boolean(),
  inbox_bucket: z.enum(["new", "in_progress", "awaiting_customer", "closed"]),
}).strict()

function message(text: string, status: number, code?: string) {
  return NextResponse.json({ message: text, ...(code ? { code } : {}) }, { status })
}

function selectedWorkspace(request: NextRequest) {
  const value = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  return z.string().uuid().safeParse(value).success ? value! : null
}

export async function GET(request: NextRequest) {
  const workspaceId = selectedWorkspace(request)
  if (!workspaceId) return message("Selecione um workspace.", 400)

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({ mode: "demo", statuses: [] })
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)

  const response = await supabaseRequest(
    `/rest/v1/intake_statuses?workspace_id=eq.${workspaceId}&select=id,key,label,position,is_initial,is_terminal,customer_notification_enabled,active,inbox_bucket,created_at,updated_at&order=position.asc,key.asc`,
    {},
    token,
  )

  if (response.status === 401) return message("Sessão expirada.", 401)
  if (!response.ok) return message("Não foi possível carregar os status.", 502)

  return NextResponse.json({ mode: "live", statuses: await response.json() })
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()

  const workspaceId = selectedWorkspace(request)
  if (!workspaceId) return message("Selecione um workspace.", 400)

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return message("A demonstração é somente leitura.", 403)
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return message("Revise os dados do status.", 400)

  if (parsed.data.is_terminal && parsed.data.inbox_bucket !== "closed") {
    return message("Status terminal deve pertencer à categoria Concluídas.", 400)
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)
  const userId = await getSupabaseUserId(token)
  if (!userId) return message("Sessão expirada.", 401)

  const response = await supabaseAdminRequest(
    "/rest/v1/rpc/create_intake_status_config_service",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_workspace_id: workspaceId,
        p_actor_user_id: userId,
        p_key: parsed.data.key,
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
    if (providerMessage.includes("duplicate") || providerMessage.includes("unique")) {
      return message("Já existe um status com essa chave.", 409)
    }
    return message("Não foi possível criar o status.", 502)
  }

  const id = (await response.json().catch(() => null)) as string | null
  return NextResponse.json({ created: true, id }, { status: 201 })
}
