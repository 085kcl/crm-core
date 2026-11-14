import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { CRM_ACCESS_COOKIE,CRM_DEMO_COOKIE,CRM_WORKSPACE_COOKIE } from "@/lib/crm-session"
import { getWorkspaceMemberContext } from "@/lib/current-workspace-member"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"
type Context = {params:Promise<{conversationId:string}>}
const schema=z.object({action:z.enum(["take","release"]),expected_version:z.number().int().positive()}).strict()
const operators=new Set(["owner","admin","manager","sales","marketing","support"])
function error(message:string,status:number,code:string) {return NextResponse.json({message,code},{status})}
export async function POST(request:NextRequest,context:Context) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const workspaceId=request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const conversationId=(await context.params).conversationId
  if (!z.string().uuid().safeParse(workspaceId).success || !z.string().uuid().safeParse(conversationId).success)
    return error("Conversa não encontrada.",404,"conversation_not_found")
  if (request.cookies.get(CRM_DEMO_COOKIE)?.value==="1")
    return error("Demonstração somente leitura.",403,"demo_read_only")
  const parsed=schema.safeParse(await request.json().catch(()=>null))
  if (!parsed.success) return error("Comando inválido.",400,"invalid_assignment")
  const token=request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return error("Sessão expirada.",401,"session_expired")
  const member=await getWorkspaceMemberContext(token,workspaceId!)
  if (!member || !operators.has(member.role)) return error("Acesso não autorizado.",403,"workspace_forbidden")

  const visible=await supabaseRequest(
    `/rest/v1/connect_conversations?workspace_id=eq.${workspaceId}&id=eq.${conversationId}&select=id,assigned_to,row_version&limit=1`,
    {},token,
  )
  if (visible.status===401) return error("Sessão expirada.",401,"session_expired")
  if (!visible.ok) return error("Falha na consulta.",502,"conversation_lookup_failed")
  const rows=await visible.json() as Array<{id:string;assigned_to:string|null;row_version:number}>
  const current=rows[0]
  if (!current) return error("Conversa não encontrada.",404,"conversation_not_found")
  if (current.row_version!==parsed.data.expected_version)
    return error("A conversa foi atualizada. Recarregue.",409,"version_conflict")

  let assignedTo:string|null
  if (parsed.data.action==="take") {
    if (current.assigned_to && current.assigned_to!==member.userId)
      return error("Esta conversa já pertence a outro atendente.",409,"already_assigned")
    assignedTo=member.userId
  } else {
    if (current.assigned_to && current.assigned_to!==member.userId && !["owner","admin","manager"].includes(member.role))
      return error("Somente o responsável ou um gestor pode liberar esta conversa.",403,"release_forbidden")
    assignedTo=null
  }
  if (assignedTo===current.assigned_to) return NextResponse.json({id:current.id,assigned_to:assignedTo,row_version:current.row_version,changed:false})
  const url=new URLSearchParams({
    workspace_id:`eq.${workspaceId}`,id:`eq.${conversationId}`,
    row_version:`eq.${current.row_version}`,select:"id,assigned_to,row_version",
  })
  const response=await supabaseRequest(`/rest/v1/connect_conversations?${url}`,{
    method:"PATCH",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify({assigned_to:assignedTo,row_version:current.row_version+1}),
  },token)
  if (response.status===401) return error("Sessão expirada.",401,"session_expired")
  if (!response.ok) return error("Não foi possível atribuir a conversa.",502,"assignment_failed")
  const updated=await response.json() as Array<{id:string;assigned_to:string|null;row_version:number}>
  if (!updated[0]) return error("Outra operação alterou a conversa.",409,"version_conflict")
  return NextResponse.json({...updated[0],changed:true})
}
