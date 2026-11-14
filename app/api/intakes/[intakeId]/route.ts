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
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ intakeId: string }> }

type IntakeRow = {
  id: string
  public_reference: string
  form_type: string
  form_schema_version: number
  source: string
  contact_id: string | null
  lead_id: string | null
  status_id: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  payload: Record<string, unknown>
  assigned_to: string | null
  submitted_at: string
  created_at: string
  updated_at: string
  row_version: number
  contact_match_state: string
  lead_link_state: string
}

function message(text: string, status: number, code?: string) {
  return NextResponse.json({ message: text, ...(code ? { code } : {}) }, { status })
}

export async function GET(request: NextRequest, context: Context) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const intakeId = (await context.params).intakeId

  if (
    !z.string().uuid().safeParse(workspaceId).success ||
    !z.string().uuid().safeParse(intakeId).success
  ) {
    return message("Solicitação não encontrada.", 404, "intake_not_found")
  }

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return message("Solicitação não encontrada na demonstração.", 404, "intake_not_found")
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401, "session_expired")

  const member = await getWorkspaceMemberContext(token, workspaceId!)
  if (!member) return message("Solicitação não encontrada.", 404, "intake_not_found")

  const intakeResponse = await supabaseRequest(
    `/rest/v1/intake_requests?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(intakeId)}&select=id,public_reference,form_type,form_schema_version,source,contact_id,lead_id,status_id,customer_name,customer_email,customer_phone,payload,assigned_to,submitted_at,created_at,updated_at,row_version,contact_match_state,lead_link_state&limit=1`,
    {},
    token,
  )
  if (intakeResponse.status === 401) return message("Sessão expirada.", 401, "session_expired")
  if (!intakeResponse.ok) {
    return message("Não foi possível carregar a solicitação.", 502, "intake_detail_failed")
  }

  const intakeRows = (await intakeResponse.json()) as IntakeRow[]
  const intake = intakeRows[0]
  if (!intake) return message("Solicitação não encontrada.", 404, "intake_not_found")

  const baseRequests: Array<Promise<Response>> = [
    supabaseRequest(
      `/rest/v1/intake_statuses?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(intake.status_id)}&select=id,key,label,inbox_bucket,is_terminal,active&limit=1`,
      {},
      token,
    ),
    supabaseRequest(
      `/rest/v1/integration_links?workspace_id=eq.${encodeURIComponent(workspaceId!)}&crm_entity_type=eq.intake_request&crm_entity_id=eq.${encodeURIComponent(intake.id)}&select=id,source_system,external_entity_type,external_id,metadata,created_at&order=created_at.asc&limit=20`,
      {},
      token,
    ),
    supabaseRequest(
      `/rest/v1/activities?workspace_id=eq.${encodeURIComponent(workspaceId!)}&entity_type=eq.intake_request&entity_id=eq.${encodeURIComponent(intake.id)}&select=id,type,actor_id,metadata,created_at&order=created_at.asc,id.asc&limit=200`,
      {},
      token,
    ),
  ]

  const [statusResponse, linkResponse, activityResponse] = await Promise.all(baseRequests)
  if (!statusResponse.ok || !linkResponse.ok) {
    return message("Não foi possível carregar os vínculos da solicitação.", 502, "intake_links_failed")
  }

  const [statuses, integrationLinks] = await Promise.all([
    statusResponse.json() as Promise<Array<{
      id: string
      key: string
      label: string
      inbox_bucket: string
      is_terminal: boolean
      active: boolean
    }>>,
    linkResponse.json() as Promise<Array<{
      id: string
      source_system: string
      external_entity_type: string
      external_id: string
      metadata: Record<string, unknown>
      created_at: string
    }>>,
  ])

  const activities = activityResponse.ok
    ? ((await activityResponse.json()) as Array<{
        id: string
        type: string
        actor_id: string | null
        metadata: Record<string, unknown>
        created_at: string
      }>)
    : []

  let contact: {
    id: string
    first_name: string
    last_name: string | null
    email: string | null
    phone: string | null
    whatsapp: string | null
    status: string
  } | null = null

  if (intake.contact_id) {
    const response = await supabaseRequest(
      `/rest/v1/contacts?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(intake.contact_id)}&select=id,first_name,last_name,email,phone,whatsapp,status&limit=1`,
      {},
      token,
    )
    if (response.ok) {
      const rows = (await response.json()) as Array<typeof contact>
      contact = rows[0] || null
    }
  }

  let lead: {
    id: string
    source: string | null
    status: string
    score: number
    qualification: string | null
    owner_id: string | null
  } | null = null

  if (intake.lead_id) {
    const response = await supabaseRequest(
      `/rest/v1/leads?workspace_id=eq.${encodeURIComponent(workspaceId!)}&id=eq.${encodeURIComponent(intake.lead_id)}&select=id,source,status,score,qualification,owner_id&limit=1`,
      {},
      token,
    )
    if (response.ok) {
      const rows = (await response.json()) as Array<typeof lead>
      lead = rows[0] || null
    }
  }

  const profileIds = new Set<string>()
  if (intake.assigned_to) profileIds.add(intake.assigned_to)
  for (const activity of activities) {
    if (activity.actor_id) profileIds.add(activity.actor_id)
  }

  const profiles = new Map<string, string>()
  if (profileIds.size > 0) {
    const response = await supabaseRequest(
      `/rest/v1/profiles?id=in.(${[...profileIds].join(",")})&select=id,display_name`,
      {},
      token,
    )
    if (response.ok) {
      const rows = (await response.json()) as Array<{ id: string; display_name: string | null }>
      for (const row of rows) profiles.set(row.id, row.display_name || "Usuário")
    }
  }

  let assignableMembers: Array<{
    user_id: string
    role: string
    display_name: string
  }> = []

  if (canOperateIntake(member.role)) {
    const memberResponse = await supabaseRequest(
      `/rest/v1/workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId!)}&status=eq.active&select=user_id,role&order=joined_at.asc&limit=200`,
      {},
      token,
    )
    if (memberResponse.ok) {
      const rows = (await memberResponse.json()) as Array<{ user_id: string; role: string }>
      const ids = rows.map((row) => row.user_id)
      const names = new Map<string, string>()
      if (ids.length > 0) {
        const profileResponse = await supabaseRequest(
          `/rest/v1/profiles?id=in.(${ids.join(",")})&select=id,display_name`,
          {},
          token,
        )
        if (profileResponse.ok) {
          const profileRows = (await profileResponse.json()) as Array<{
            id: string
            display_name: string | null
          }>
          for (const row of profileRows) names.set(row.id, row.display_name || "Usuário")
        }
      }
      assignableMembers = rows
        .filter((row) => row.role !== "viewer")
        .map((row) => ({
          user_id: row.user_id,
          role: row.role,
          display_name: names.get(row.user_id) || "Usuário",
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR"))
    }
  }

  return NextResponse.json({
    mode: "live",
    role: member.role,
    permissions: {
      operate: canOperateIntake(member.role),
      assign: canOperateIntake(member.role),
    },
    intake: {
      ...intake,
      status: statuses[0] || null,
      assignee: intake.assigned_to
        ? {
            id: intake.assigned_to,
            display_name: profiles.get(intake.assigned_to) || "Usuário indisponível",
          }
        : null,
      needs_review:
        intake.contact_match_state === "needs_review" ||
        intake.lead_link_state === "pending_review",
    },
    contact,
    lead,
    integration_links: integrationLinks,
    activities: activities.map((activity) => ({
      ...activity,
      actor_name: activity.actor_id
        ? profiles.get(activity.actor_id) || "Usuário"
        : activity.type.startsWith("intake.")
          ? "Sistema"
          : "Sistema",
    })),
    assignable_members: assignableMembers,
    partial: {
      activities_unavailable: !activityResponse.ok,
    },
  })
}
