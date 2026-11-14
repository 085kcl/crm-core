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

type Context = { params: Promise<{ intakeId: string }> }

const transitionSchema = z.object({
  target_status_id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  request_id: z.string().trim().min(8).max(200),
  comment: z.string().trim().max(2000).nullable().optional(),
}).strict()

type IntakeRow = {
  id: string
  public_reference: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  source: string
  submitted_at: string
  status_id: string
  row_version: number
}

type IntakeStatusRow = {
  id: string
  key: string
  label: string
  position: number
  is_initial: boolean
  is_terminal: boolean
  customer_notification_enabled: boolean
  active: boolean
  inbox_bucket: "new" | "in_progress" | "awaiting_customer" | "closed"
}

type IntakeHistoryRow = {
  id: string
  from_status_id: string | null
  to_status_id: string
  from_status_key: string | null
  from_status_label: string | null
  to_status_key: string
  to_status_label: string
  actor_user_id: string | null
  actor_type: "user" | "system" | "integration"
  changed_at: string
  comment: string | null
  change_source: string
  request_id: string
  resulting_version: number
  customer_notification_enabled_snapshot: boolean
}

function message(text: string, status: number, code?: string) {
  return NextResponse.json({ message: text, ...(code ? { code } : {}) }, { status })
}

function ids(request: NextRequest, intakeId: string) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  if (
    !z.string().uuid().safeParse(workspaceId).success ||
    !z.string().uuid().safeParse(intakeId).success
  ) {
    return null
  }
  return { workspaceId: workspaceId!, intakeId }
}

export async function GET(request: NextRequest, context: Context) {
  const intakeId = (await context.params).intakeId
  const resolved = ids(request, intakeId)
  if (!resolved) return message("Solicitação não encontrada.", 404, "intake_not_found")

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({
      mode: "demo",
      intake: null,
      statuses: [],
      history: [],
      status_notifications_enabled: false,
    })
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401, "session_expired")

  const intakeResponse = await supabaseRequest(
    `/rest/v1/intake_requests?workspace_id=eq.${resolved.workspaceId}&id=eq.${resolved.intakeId}&select=id,public_reference,customer_name,customer_email,customer_phone,source,submitted_at,status_id,row_version&limit=1`,
    {},
    token,
  )

  if (intakeResponse.status === 401) return message("Sessão expirada.", 401, "session_expired")
  if (!intakeResponse.ok) {
    return message("Não foi possível consultar a solicitação.", 502, "intake_lookup_failed")
  }

  const intakeRows = (await intakeResponse.json()) as IntakeRow[]
  const intake = intakeRows[0]
  if (!intake) return message("Solicitação não encontrada.", 404, "intake_not_found")

  const [statusResponse, historyResponse, policyResponse] = await Promise.all([
    supabaseRequest(
      `/rest/v1/intake_statuses?workspace_id=eq.${resolved.workspaceId}&select=id,key,label,position,is_initial,is_terminal,customer_notification_enabled,active,inbox_bucket&order=position.asc,key.asc`,
      {},
      token,
    ),
    supabaseRequest(
      `/rest/v1/intake_status_history?workspace_id=eq.${resolved.workspaceId}&intake_request_id=eq.${resolved.intakeId}&select=id,from_status_id,to_status_id,from_status_key,from_status_label,to_status_key,to_status_label,actor_user_id,actor_type,changed_at,comment,change_source,request_id,resulting_version,customer_notification_enabled_snapshot&order=changed_at.asc,id.asc&limit=500`,
      {},
      token,
    ),
    supabaseAdminRequest(
      `/rest/v1/notification_settings?workspace_id=eq.${encodeURIComponent(resolved.workspaceId)}&select=status_notifications_enabled&limit=1`,
    ),
  ])

  if (!statusResponse.ok || !historyResponse.ok || !policyResponse.ok) {
    return message("Não foi possível carregar o workflow da solicitação.", 502, "status_workflow_load_failed")
  }

  const statuses = (await statusResponse.json()) as IntakeStatusRow[]
  const history = (await historyResponse.json()) as IntakeHistoryRow[]
  const notificationRows = (await policyResponse.json().catch(() => [])) as Array<{
    status_notifications_enabled?: boolean
  }>

  return NextResponse.json({
    mode: "live",
    intake,
    statuses,
    history,
    status_notifications_enabled: Boolean(notificationRows[0]?.status_notifications_enabled),
  })
}

export async function POST(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return rejectedMutation()

  const intakeId = (await context.params).intakeId
  const resolved = ids(request, intakeId)
  if (!resolved) return message("Solicitação não encontrada.", 404, "intake_not_found")

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return message("A demonstração é somente leitura.", 403, "demo_read_only")
  }

  const parsed = transitionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return message("Revise a mudança de status.", 400, "invalid_status_transition")
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401, "session_expired")

  // User-scoped lookup proves that the session may see this intake in this workspace.
  const intakeResponse = await supabaseRequest(
    `/rest/v1/intake_requests?workspace_id=eq.${resolved.workspaceId}&id=eq.${resolved.intakeId}&select=id,row_version,status_id&limit=1`,
    {},
    token,
  )
  if (intakeResponse.status === 401) return message("Sessão expirada.", 401, "session_expired")
  if (!intakeResponse.ok) {
    return message("Não foi possível consultar a solicitação.", 502, "intake_lookup_failed")
  }

  const intakeRows = (await intakeResponse.json()) as Array<{
    id: string
    row_version: number
    status_id: string
  }>
  if (!intakeRows[0]) return message("Solicitação não encontrada.", 404, "intake_not_found")

  const userId = await getSupabaseUserId(token)
  if (!userId) return message("Sessão expirada.", 401, "session_expired")

  const rpcResponse = await supabaseAdminRequest(
    "/rest/v1/rpc/transition_intake_status_service",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_workspace_id: resolved.workspaceId,
        p_intake_id: resolved.intakeId,
        p_target_status_id: parsed.data.target_status_id,
        p_expected_version: parsed.data.expected_version,
        p_request_id: parsed.data.request_id,
        p_comment: parsed.data.comment ?? null,
        p_actor_user_id: userId,
        p_change_source: "ui",
      }),
    },
  )

  const body = (await rpcResponse.json().catch(() => null)) as
    | Array<{
        changed: boolean
        replayed: boolean
        row_version: number
        history_id: string | null
        status_id: string
        status_key: string
        status_label: string
        customer_notification_enabled: boolean
      }>
    | { message?: string }
    | null

  if (!rpcResponse.ok) {
    const detail = !Array.isArray(body) ? body?.message || "" : ""

    if (
      detail.includes("intake_version_conflict") ||
      detail.includes("status_request_id_conflict")
    ) {
      return message(
        "A solicitação foi alterada por outra operação. Recarregue e tente novamente.",
        409,
        "status_conflict",
      )
    }
    if (
      detail.includes("not_authorized") ||
      detail.includes("terminal_reopen_not_authorized")
    ) {
      return message("Seu papel não permite esta mudança.", 403, "status_forbidden")
    }
    if (detail.includes("terminal_reopen_reason_required")) {
      return message(
        "Informe uma justificativa para reabrir uma solicitação encerrada.",
        400,
        "reopen_reason_required",
      )
    }
    if (
      detail.includes("target_intake_status_unavailable") ||
      detail.includes("intake_not_found")
    ) {
      return message("Status ou solicitação indisponível.", 404, "status_unavailable")
    }

    return message("Não foi possível alterar o status.", 502, "status_transition_failed")
  }

  const result = Array.isArray(body) ? body[0] : null
  if (!result) {
    return message("Não foi possível confirmar a mudança.", 502, "invalid_status_response")
  }

  return NextResponse.json({
    changed: result.changed,
    replayed: result.replayed,
    row_version: result.row_version,
    history_id: result.history_id,
    status: {
      id: result.status_id,
      key: result.status_key,
      label: result.status_label,
      customer_notification_enabled: result.customer_notification_enabled,
    },
  })
}
