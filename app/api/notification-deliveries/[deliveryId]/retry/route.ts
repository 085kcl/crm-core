import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { supabaseAdminRequest } from "@/lib/supabase-admin"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ deliveryId: string }> }

const retrySchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict()

function message(text: string, status: number) {
  return NextResponse.json({ message: text }, { status })
}

export async function POST(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return rejectedMutation()

  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const deliveryId = (await context.params).deliveryId

  if (
    !z.string().uuid().safeParse(workspaceId).success ||
    !z.string().uuid().safeParse(deliveryId).success
  ) {
    return message("Comunicação não encontrada.", 404)
  }

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return message("A demonstração é somente leitura.", 403)
  }

  const parsed = retrySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return message("Informe o motivo do retry.", 400)

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)

  const deliveryResponse = await supabaseRequest(
    `/rest/v1/notification_deliveries?workspace_id=eq.${workspaceId}&id=eq.${deliveryId}&select=id,status,reconciliation_required&limit=1`,
    {},
    token,
  )
  if (deliveryResponse.status === 401) return message("Sessão expirada.", 401)
  if (!deliveryResponse.ok) return message("Não foi possível consultar a comunicação.", 502)

  const deliveries = (await deliveryResponse.json()) as Array<{
    id: string
    status: string
    reconciliation_required: boolean
  }>
  if (!deliveries[0]) return message("Comunicação não encontrada.", 404)
  if (deliveries[0].status !== "failed") {
    return message("Somente comunicações com falha podem ser reenfileiradas.", 409)
  }
  if (deliveries[0].reconciliation_required) {
    return message("Esta comunicação exige reconciliação antes de novo envio.", 409)
  }

  const response = await supabaseRequest(
    "/functions/v1/crm-intake-operator-command",
    {
      method: "POST",
      body: JSON.stringify({
        command: "retry_notification",
        workspace_id: workspaceId,
        delivery_id: deliveryId,
        reason: parsed.data.reason,
      }),
    },
    token,
  )

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null
    const providerMessage = detail?.message || ""
    if (providerMessage.includes("retry_not_authorized")) {
      return message("Seu papel não permite solicitar retry.", 403)
    }
    if (
      providerMessage.includes("requires_failed_state") ||
      providerMessage.includes("requires_reconciliation") ||
      providerMessage.includes("attempts_exhausted")
    ) {
      return message("A comunicação não está elegível para retry.", 409)
    }
    return message("Não foi possível solicitar o retry.", 502)
  }

  return NextResponse.json({ scheduled: true })
}
