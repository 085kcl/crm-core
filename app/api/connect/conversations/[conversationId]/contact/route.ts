import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { CRM_ACCESS_COOKIE,CRM_DEMO_COOKIE,CRM_WORKSPACE_COOKIE } from "@/lib/crm-session"
import { getWorkspaceMemberContext } from "@/lib/current-workspace-member"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"
type Context={params:Promise<{conversationId:string}>}
const schema=z.object({
  contact_id:z.string().uuid().nullable(),
  expected_version:z.number().int().positive(),
}).strict()
const roles=new Set(["owner","admin","manager","sales","marketing","support"])
function error(message:string,status:number,code:string){return NextResponse.json({message,code},{status})}

export async function POST(request:NextRequest,context:Context) {
  if(!isSameOriginMutation(request))return rejectedMutation()
  const workspaceId=request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const conversationId=(await context.params).conversationId
  if(!z.string().uuid().safeParse(workspaceId).success||!z.string().uuid().safeParse(conversationId).success)
    return error("Conversa não encontrada.",404,"conversation_not_found")
  if(request.cookies.get(CRM_DEMO_COOKIE)?.value==="1")
    return error("Demonstração somente leitura.",403,"demo_read_only")
  const parsed=schema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return error("Vínculo inválido.",400,"invalid_contact_link")
  const token=request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if(!token)return error("Sessão expirada.",401,"session_expired")
  const member=await getWorkspaceMemberContext(token,workspaceId!)
  if(!member||!roles.has(member.role))return error("Acesso não autorizado.",403,"workspace_forbidden")

  const response=await supabaseRequest(
    `/rest/v1/connect_conversations?workspace_id=eq.${workspaceId}&id=eq.${conversationId}&select=id,assigned_to,contact_id,row_version&limit=1`,
    {},token,
  )
  if(response.status===401)return error("Sessão expirada.",401,"session_expired")
  if(!response.ok)return error("Não foi possível consultar a conversa.",502,"conversation_lookup_failed")
  const rows=await response.json() as Array<{id:string;assigned_to:string|null;contact_id:string|null;row_version:number}>
  const current=rows[0]
  if(!current)return error("Conversa não encontrada.",404,"conversation_not_found")
  if(current.row_version!==parsed.data.expected_version)return error("A conversa foi atualizada. Recarregue.",409,"version_conflict")
  if(current.assigned_to&&current.assigned_to!==member.userId&&!["owner","admin","manager"].includes(member.role))
    return error("Esta conversa pertence a outro atendente.",403,"contact_link_forbidden")

  const contactId=parsed.data.contact_id
  if(contactId){
    const found=await supabaseRequest(
      `/rest/v1/contacts?workspace_id=eq.${workspaceId}&id=eq.${contactId}&select=id&limit=1`,
      {},token,
    )
    if(!found.ok)return error("Não foi possível validar o contato.",502,"contact_lookup_failed")
    const options=await found.json() as Array<{id:string}>
    if(!options[0])return error("Contato não encontrado neste workspace.",404,"contact_not_found")
  }
  if(current.contact_id===contactId)return NextResponse.json({id:current.id,contact_id:contactId,row_version:current.row_version,changed:false})
  const params=new URLSearchParams({
    workspace_id:`eq.${workspaceId}`,id:`eq.${conversationId}`,
    row_version:`eq.${current.row_version}`,select:"id,contact_id,row_version",
  })
  const updated=await supabaseRequest(`/rest/v1/connect_conversations?${params}`,{
    method:"PATCH",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify({contact_id:contactId,row_version:current.row_version+1}),
  },token)
  if(updated.status===401)return error("Sessão expirada.",401,"session_expired")
  if(!updated.ok)return error("Não foi possível vincular o contato.",502,"contact_link_failed")
  const records=await updated.json() as Array<{id:string;contact_id:string|null;row_version:number}>
  if(!records[0])return error("Outra operação alterou a conversa.",409,"version_conflict")
  return NextResponse.json({...records[0],changed:true})
}
