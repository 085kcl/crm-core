import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { CRM_ACCESS_COOKIE, CRM_DEMO_COOKIE, CRM_WORKSPACE_COOKIE } from "@/lib/crm-session"
import { getWorkspaceMemberContext } from "@/lib/current-workspace-member"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"
type Context = {params: Promise<{conversationId:string}>}
const roles = new Set(["owner","admin","manager","sales","marketing","support"])
function error(message: string, status: number, code: string) {
  return NextResponse.json({message,code},{status})
}
export async function GET(request: NextRequest, context: Context) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const conversationId = (await context.params).conversationId
  if (!z.string().uuid().safeParse(workspaceId).success || !z.string().uuid().safeParse(conversationId).success)
    return error("Conversa não encontrada.",404,"conversation_not_found")
  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1")
    return NextResponse.json({mode:"demo",messages:[]})
  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return error("Sessão expirada.",401,"session_expired")
  const member = await getWorkspaceMemberContext(token,workspaceId!)
  if (!member || !roles.has(member.role)) return error("Acesso negado.",403,"workspace_forbidden")
  const visible = await supabaseRequest(
    `/rest/v1/connect_conversations?workspace_id=eq.${workspaceId}&id=eq.${conversationId}&select=id&limit=1`,
    {},token,
  )
  if (visible.status===401) return error("Sessão expirada.",401,"session_expired")
  if (!visible.ok) return error("Não foi possível consultar a conversa.",502,"conversation_lookup_failed")
  const rows = await visible.json() as Array<{id:string}>
  if (!rows[0]) return error("Conversa não encontrada.",404,"conversation_not_found")

  const response = await supabaseRequest(
    `/rest/v1/connect_messages?workspace_id=eq.${workspaceId}&conversation_id=eq.${conversationId}&select=id,direction,message_type,body,occurred_at&order=occurred_at.desc,id.desc&limit=100`,
    {},token,
  )
  if (response.status===401) return error("Sessão expirada.",401,"session_expired")
  if (!response.ok) return error("Não foi possível carregar as mensagens.",502,"messages_failed")
  const messages = (await response.json() as Array<{
    id:string;direction:string;message_type:string;body:string;occurred_at:string
  }>).reverse()
  return NextResponse.json({mode:"live",messages},{headers:{"Cache-Control":"no-store"}})
}
