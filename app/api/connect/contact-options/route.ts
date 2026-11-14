import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { CRM_ACCESS_COOKIE,CRM_DEMO_COOKIE,CRM_WORKSPACE_COOKIE } from "@/lib/crm-session"
import { getWorkspaceMemberContext } from "@/lib/current-workspace-member"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic="force-dynamic"
const roles=new Set(["owner","admin","manager","sales","marketing","support"])
function error(message:string,status:number,code:string){return NextResponse.json({message,code},{status})}
export async function GET(request:NextRequest) {
 const workspaceId=request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
 if(!z.string().uuid().safeParse(workspaceId).success)return error("Selecione um workspace.",400,"workspace_required")
 if(request.cookies.get(CRM_DEMO_COOKIE)?.value==="1")
   return NextResponse.json({mode:"demo",contacts:[]})
 const token=request.cookies.get(CRM_ACCESS_COOKIE)?.value
 if(!token)return error("Sessão expirada.",401,"session_expired")
 const member=await getWorkspaceMemberContext(token,workspaceId!)
 if(!member||!roles.has(member.role))return error("Acesso não autorizado.",403,"workspace_forbidden")
 const response=await supabaseRequest(
   `/rest/v1/contacts?workspace_id=eq.${workspaceId}&status=eq.active&select=id,first_name,last_name,email&order=updated_at.desc&limit=100`,
   {},token,
 )
 if(response.status===401)return error("Sessão expirada.",401,"session_expired")
 if(!response.ok)return error("Não foi possível carregar contatos.",502,"contacts_failed")
 return NextResponse.json({mode:"live",contacts:await response.json()},{headers:{"Cache-Control":"no-store"}})
}
