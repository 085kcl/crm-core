import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import {
  canOperateIntake,
  getWorkspaceMemberContext,
} from "@/lib/current-workspace-member"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { supabaseAdminRequest } from "@/lib/supabase-admin"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ intakeId: string }> }

const assignmentSchema = z.object({
  assigned_to: z.string().uuid().nullable(),
  expected_version: z.number().int().positive(),
  request_id: z.string().trim().min(8).max(200),
}).strict()

function message(text: string, status: number, code?: string) {
  return NextResponse.json({ message: text, ...(code ? { code } : {}) }, { status })
}

export async function POST(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return rejectedMutation()

  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const intakeId = (await context.params).intakeId
  if (
    !z.string().uuid().safeParse(workspaceId).success ||
    !z.string().uuid().safeParse(intakeId).success
  ) {
    return message("Solicitação não encontrada.", 404, "intake_not_found")
  }

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return message("A demonstração é somente leitura.", 403, "demo_read_only")
  }

  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return message("Revise a atribuição da solicitação.", 400, "invalid_assignment")
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401, "session_expired")

  const member = await getWorkspaceMemberContext(token, workspaceId!)
  if (!member) return message("Solicitação não encontrada.", 404, "intake_not_found")
  if (!canOperateIntake(member.role)) {
    return message("Seu papel não permite atribuir solicitações.", 403, "assignment_forbidden")
  }

  const visible = await supabaseRequest(
    `/rest/v1/intake_requests?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(intakeId)}&select=id,row_version,assigned_to&limit=1`,
    {},
    token,
  )
  if (visible.status === 401) return message("Sessão expirada.", 401, "session_expired")
  if (!visible.ok) return message("Não foi possível consultar a solicitação.", 502, "intake_lookup_failed")
  const rows = (await visible.json()) as Array<{
    id: string
    row_version: number
    assigned_to: string | null
  }>
  if (!rows[0]) return message("Solicitação não encontrada.", 404, "intake_not_found")

  const response = await supabaseRequest(
    "/functions/v1/crm-intake-operator-command",
    {
      method: "POST",
      body: JSON.stringify({
        command: "assign",
        workspace_id: workspaceId,
        intake_id: intakeId,
        assigned_to: parsed.data.assigned_to,
        expected_version: parsed.data.expected_version,
        request_id: parsed.data.request_id,
      }),
    },
    token,
  )

  const body = (await response.json().catch(() => null)) as
    | Array<{
        changed: boolean
        row_version: number
        assigned_to: string | null
      }>
    | { message?: string }
    | null

  if (!response.ok) {
    const detail = !Array.isArray(body) ? body?.message || "" : ""
    if (detail.includes("intake_version_conflict")) {
      return message(
        "A solicitação foi alterada por outra operação. Recarregue antes de atribuir novamente.",
        409,
        "assignment_conflict",
      )
    }
    if (detail.includes("intake_assignment_not_authorized")) {
      return message("Seu papel não permite atribuir solicitações.", 403, "assignment_forbidden")
    }
    if (detail.includes("intake_assignee_unavailable")) {
      return message("O responsável selecionado não está disponível neste workspace.", 409, "assignee_unavailable")
    }
    if (detail.includes("intake_not_found")) {
      return message("Solicitação não encontrada.", 404, "intake_not_found")
    }
    return message("Não foi possível alterar o responsável.", 502, "assignment_failed")
  }

  const result = Array.isArray(body) ? body[0] : null
  if (!result) return message("Não foi possível confirmar a atribuição.", 502, "assignment_response_invalid")

  return NextResponse.json(result)
}
