import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { CRM_ACCESS_COOKIE, CRM_DEMO_COOKIE, CRM_WORKSPACE_COOKIE } from "@/lib/crm-session"
import { getWorkspaceMemberContext } from "@/lib/current-workspace-member"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

const schema = z.object({
  status: z.enum(["all", "open", "pending", "closed"]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
}).strict()
const roles = new Set(["owner","admin","manager","sales","marketing","support"])
function error(message: string, status: number, code: string) {
  return NextResponse.json({ message, code }, { status })
}
function totalOf(range: string | null) {
  return Number.parseInt(range?.split("/")[1] || "0",10) || 0
}
export async function GET(request: NextRequest) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  if (!z.string().uuid().safeParse(workspaceId).success) return error("Selecione um workspace.",400,"workspace_required")
  const query = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()))
  if (!query.success) return error("Filtros inválidos.",400,"invalid_filters")
  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({ mode:"demo",items:[],page:query.data.page,limit:query.data.limit,total:0 })
  }
  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return error("Sessão expirada.",401,"session_expired")
  const member = await getWorkspaceMemberContext(token, workspaceId!)
  if (!member || !roles.has(member.role)) return error("Acesso não autorizado.",403,"workspace_forbidden")

  const params = new URLSearchParams({
    workspace_id:`eq.${workspaceId}`,
    select:"id,provider,external_participant_id,participant_display_name,contact_id,lead_id,assigned_to,status,row_version,last_message_at,last_message_preview",
    order:"last_message_at.desc.nullslast,id.desc",
  })
  if (query.data.status !== "all") params.set("status", `eq.${query.data.status}`)
  const offset = (query.data.page-1) * query.data.limit
  const response = await supabaseRequest(`/rest/v1/connect_conversations?${params}`,{
    headers:{ Prefer:"count=exact", Range:`${offset}-${offset+query.data.limit-1}` },
  },token)
  if (response.status===401) return error("Sessão expirada.",401,"session_expired")
  if (response.status===416) return NextResponse.json({mode:"live",items:[],total:totalOf(response.headers.get("content-range")),page:query.data.page,limit:query.data.limit,me:member.userId,role:member.role})
  if (!response.ok) return error("Não foi possível carregar as conversas.",502,"connect_list_failed")
  const items = await response.json()
  return NextResponse.json({
    mode:"live",items,total:totalOf(response.headers.get("content-range")),
    page:query.data.page,limit:query.data.limit,me:member.userId,role:member.role,
  },{headers:{"Cache-Control":"no-store"}})
}
