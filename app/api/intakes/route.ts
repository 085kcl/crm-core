import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import { getWorkspaceMemberContext } from "@/lib/current-workspace-member"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  bucket: z.enum(["all", "new", "in_progress", "awaiting_customer", "closed"]).default("all"),
  assignee: z.enum(["all", "mine", "unassigned"]).default("all"),
  needs_review: z.enum(["0", "1"]).default("0"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
}).strict()

type StatusRow = {
  id: string
  key: string
  label: string
  inbox_bucket: "new" | "in_progress" | "awaiting_customer" | "closed"
  is_terminal: boolean
  active: boolean
}

type IntakeRow = {
  id: string
  public_reference: string
  form_type: string
  source: string
  contact_id: string | null
  lead_id: string | null
  status_id: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  assigned_to: string | null
  submitted_at: string
  updated_at: string
  row_version: number
  contact_match_state: "new" | "matched" | "needs_review"
  lead_link_state: "created" | "linked" | "pending_review" | "not_required"
}

type ProfileRow = {
  id: string
  display_name: string | null
}

type DeliveryRow = {
  intake_request_id: string
  status: string
  reconciliation_required: boolean
}

function message(text: string, status: number, code?: string) {
  return NextResponse.json({ message: text, ...(code ? { code } : {}) }, { status })
}

function parseTotal(contentRange: string | null) {
  if (!contentRange) return 0
  const total = contentRange.split("/")[1]
  return total && total !== "*" ? Number.parseInt(total, 10) || 0 : 0
}

export async function GET(request: NextRequest) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  if (!z.string().uuid().safeParse(workspaceId).success) {
    return message("Selecione um workspace.", 400, "workspace_required")
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()))
  if (!parsed.success) return message("Revise os filtros da caixa de solicitações.", 400, "invalid_filters")

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({
      mode: "demo",
      role: "viewer",
      items: [],
      page: parsed.data.page,
      limit: parsed.data.limit,
      total: 0,
      total_pages: 0,
      communications_available: true,
    })
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401, "session_expired")

  const member = await getWorkspaceMemberContext(token, workspaceId!)
  if (!member) return message("Acesso ao workspace negado.", 403, "workspace_forbidden")

  const statusResponse = await supabaseRequest(
    `/rest/v1/intake_statuses?workspace_id=eq.${encodeURIComponent(workspaceId!)}&select=id,key,label,inbox_bucket,is_terminal,active&order=position.asc,key.asc`,
    {},
    token,
  )
  if (statusResponse.status === 401) return message("Sessão expirada.", 401, "session_expired")
  if (!statusResponse.ok) {
    return message("Não foi possível carregar os filtros de solicitações.", 502, "status_lookup_failed")
  }

  const statuses = (await statusResponse.json()) as StatusRow[]
  const statusById = new Map(statuses.map((status) => [status.id, status]))
  const matchingStatusIds =
    parsed.data.bucket === "all"
      ? []
      : statuses
          .filter((status) => status.inbox_bucket === parsed.data.bucket)
          .map((status) => status.id)

  if (parsed.data.bucket !== "all" && matchingStatusIds.length === 0) {
    return NextResponse.json({
      mode: "live",
      role: member.role,
      items: [],
      page: parsed.data.page,
      limit: parsed.data.limit,
      total: 0,
      total_pages: 0,
      communications_available: true,
    })
  }

  const params = new URLSearchParams()
  params.set("workspace_id", `eq.${workspaceId}`)
  params.set(
    "select",
    [
      "id",
      "public_reference",
      "form_type",
      "source",
      "contact_id",
      "lead_id",
      "status_id",
      "customer_name",
      "customer_email",
      "customer_phone",
      "assigned_to",
      "submitted_at",
      "updated_at",
      "row_version",
      "contact_match_state",
      "lead_link_state",
    ].join(","),
  )
  params.set("order", "submitted_at.desc,id.desc")

  if (matchingStatusIds.length > 0) {
    params.set("status_id", `in.(${matchingStatusIds.join(",")})`)
  }
  if (parsed.data.assignee === "mine") {
    params.set("assigned_to", `eq.${member.userId}`)
  } else if (parsed.data.assignee === "unassigned") {
    params.set("assigned_to", "is.null")
  }
  if (parsed.data.needs_review === "1") {
    params.set("or", "(contact_match_state.eq.needs_review,lead_link_state.eq.pending_review)")
  }

  const offset = (parsed.data.page - 1) * parsed.data.limit
  const intakeResponse = await supabaseRequest(
    `/rest/v1/intake_requests?${params.toString()}`,
    {
      headers: {
        Prefer: "count=exact",
        Range: `${offset}-${offset + parsed.data.limit - 1}`,
      },
    },
    token,
  )

  if (intakeResponse.status === 401) return message("Sessão expirada.", 401, "session_expired")
  if (intakeResponse.status === 416) {
    return NextResponse.json({
      mode: "live",
      role: member.role,
      items: [],
      page: parsed.data.page,
      limit: parsed.data.limit,
      total: parseTotal(intakeResponse.headers.get("content-range")),
      total_pages: 0,
      communications_available: true,
    })
  }
  if (!intakeResponse.ok) {
    return message("Não foi possível carregar as solicitações.", 502, "intake_list_failed")
  }

  const intakes = (await intakeResponse.json()) as IntakeRow[]
  const total = parseTotal(intakeResponse.headers.get("content-range"))

  const assigneeIds = [...new Set(intakes.flatMap((item) => (item.assigned_to ? [item.assigned_to] : [])))]
  const assigneeNames = new Map<string, string>()
  if (assigneeIds.length > 0) {
    const profileResponse = await supabaseRequest(
      `/rest/v1/profiles?id=in.(${assigneeIds.join(",")})&select=id,display_name`,
      {},
      token,
    )
    if (profileResponse.ok) {
      const profiles = (await profileResponse.json()) as ProfileRow[]
      for (const profile of profiles) {
        assigneeNames.set(profile.id, profile.display_name || "Usuário")
      }
    }
  }

  let communicationsAvailable = true
  const deliveryState = new Map<string, { failed: boolean; reconciliation: boolean }>()
  if (intakes.length > 0) {
    const intakeIds = intakes.map((item) => item.id)
    const deliveryResponse = await supabaseRequest(
      `/rest/v1/notification_deliveries?workspace_id=eq.${encodeURIComponent(workspaceId!)}&intake_request_id=in.(${intakeIds.join(",")})&select=intake_request_id,status,reconciliation_required&limit=500`,
      {},
      token,
    )
    if (deliveryResponse.ok) {
      const deliveries = (await deliveryResponse.json()) as DeliveryRow[]
      for (const delivery of deliveries) {
        const current = deliveryState.get(delivery.intake_request_id) || {
          failed: false,
          reconciliation: false,
        }
        current.failed ||= delivery.status === "failed"
        current.reconciliation ||= delivery.reconciliation_required
        deliveryState.set(delivery.intake_request_id, current)
      }
    } else {
      communicationsAvailable = false
    }
  }

  const items = intakes.map((intake) => {
    const status = statusById.get(intake.status_id)
    const communication = deliveryState.get(intake.id)
    return {
      ...intake,
      status: status
        ? {
            id: status.id,
            key: status.key,
            label: status.label,
            inbox_bucket: status.inbox_bucket,
            is_terminal: status.is_terminal,
            active: status.active,
          }
        : null,
      assignee: intake.assigned_to
        ? {
            id: intake.assigned_to,
            display_name: assigneeNames.get(intake.assigned_to) || "Usuário indisponível",
          }
        : null,
      needs_review:
        intake.contact_match_state === "needs_review" ||
        intake.lead_link_state === "pending_review",
      communication_state: communication?.reconciliation
        ? "reconciliation_required"
        : communication?.failed
          ? "failed"
          : communicationsAvailable
            ? "ok"
            : "unknown",
    }
  })

  return NextResponse.json({
    mode: "live",
    role: member.role,
    items,
    page: parsed.data.page,
    limit: parsed.data.limit,
    total,
    total_pages: total > 0 ? Math.ceil(total / parsed.data.limit) : 0,
    communications_available: communicationsAvailable,
  })
}
