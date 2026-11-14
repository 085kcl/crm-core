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

function message(text: string, status: number) {
  return NextResponse.json({ message: text }, { status })
}

export async function POST(request: NextRequest, context: Context) {
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

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)
  const userId = await getSupabaseUserId(token)
  if (!userId) return message("Sessão expirada.", 401)

  const response = await supabaseAdminRequest(
    "/rest/v1/rpc/set_initial_intake_status_service",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_workspace_id: workspaceId,
        p_status_id: statusId,
        p_actor_user_id: userId,
      }),
    },
  )

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null
    const providerMessage = detail?.message || ""

    if (providerMessage.includes("not_authorized")) {
      return message("Seu papel não permite alterar o status inicial.", 403)
    }
    if (providerMessage.includes("must_be_active_nonterminal")) {
      return message("O status inicial precisa estar ativo e não pode ser terminal.", 409)
    }
    if (providerMessage.includes("intake_status_not_found")) {
      return message("Status não encontrado.", 404)
    }
    return message("Não foi possível alterar o status inicial.", 502)
  }

  return NextResponse.json({ saved: true, initial_status_id: statusId })
}
