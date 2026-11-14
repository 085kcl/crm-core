import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { CRM_ACCESS_COOKIE, CRM_DEMO_COOKIE, CRM_WORKSPACE_COOKIE } from "@/lib/crm-session"
import { supabaseRequest } from "@/lib/supabase-server"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { metadataMutation, validFieldValue } from "@/lib/custom-fields"
import type { ContactCustomField } from "@/lib/crm-v003-types"

type Context = { params: Promise<{ contactId: string }> }
const message = (text: string, status: number) => NextResponse.json({ message: text }, { status })

async function scope(request: NextRequest, context: Context) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const contactId = (await context.params).contactId
  if (!z.string().uuid().safeParse(workspaceId).success || !z.string().uuid().safeParse(contactId).success) return message("Contato não encontrado.", 404)
  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") return message("A edição está disponível no workspace conectado. A demonstração é somente leitura.", 403)
  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)
  const lookup = await supabaseRequest(`/rest/v1/contacts?workspace_id=eq.${workspaceId}&id=eq.${contactId}&select=id`, {}, token)
  if (lookup.status === 401) return message("Sessão expirada.", 401)
  if (!lookup.ok) return message("Não foi possível carregar o contato.", 502)
  const contacts = await lookup.json() as Array<{ id: string }>
  if (!contacts.length) return message("Contato não encontrado.", 404)
  return { workspaceId: workspaceId!, contactId, token }
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const selected = await scope(request, context)
    if (selected instanceof Response) return selected
    const response = await supabaseRequest(`/rest/v1/tags?workspace_id=eq.${selected.workspaceId}&select=id,name,slug,description&order=name.asc`, {}, selected.token)
    if (!response.ok) return message("Não foi possível carregar as tags.", response.status === 401 ? 401 : 502)
    return NextResponse.json({ tags: await response.json() })
  } catch { return message("Não foi possível carregar as tags. Tente novamente.", 502) }
}

export async function POST(request: NextRequest, context: Context) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const parsed = metadataMutation.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return message("Revise os dados informados.", 400)
  try {
    const selected = await scope(request, context)
    if (selected instanceof Response) return selected
    const { workspaceId, contactId, token } = selected
    // The selected tenant always comes from the session; RLS authorizes every operation.
    const tenant = `workspace_id=eq.${workspaceId}`
    const entity = `${tenant}&entity_type=eq.contact&entity_id=eq.${contactId}`
    const data = parsed.data
    let path: string
    let method = "POST"
    let body: unknown
    let prefer = "return=representation"
    switch (data.action) {
      case "create_tag":
        path = "/rest/v1/tags"
        body = { workspace_id: workspaceId, name: data.name, slug: data.slug }
        break
      case "attach_tag":
        path = "/rest/v1/entity_tags?on_conflict=workspace_id,tag_id,entity_type,entity_id"
        prefer += ",resolution=ignore-duplicates"
        body = { workspace_id: workspaceId, entity_type: "contact", entity_id: contactId, tag_id: data.tag_id }
        break
      case "remove_tag":
        path = `/rest/v1/entity_tags?${entity}&tag_id=eq.${data.tag_id}`
        method = "DELETE"
        break
      case "create_field": {
        const { action: _action, ...definition } = data
        void _action
        path = "/rest/v1/custom_field_definitions"
        body = { ...definition, workspace_id: workspaceId, entity_type: "contact" }
        break
      }
      default: {
        const definitionResponse = await supabaseRequest(`/rest/v1/custom_field_definitions?${tenant}&id=eq.${data.definition_id}&entity_type=eq.contact&status=eq.active&select=field_type,options,is_required`, {}, token)
        if (!definitionResponse.ok) return message("Não foi possível consultar o campo.", definitionResponse.status === 401 ? 401 : 502)
        const definition = ((await definitionResponse.json()) as ContactCustomField[])[0]
        if (!definition) return message("Campo indisponível.", 404)
        if (data.action === "clear_field") {
          if (definition.is_required) return message("Preencha o campo obrigatório.", 400)
          path = `/rest/v1/custom_field_values?${entity}&definition_id=eq.${data.definition_id}`
          method = "DELETE"
        } else {
          if (!validFieldValue(definition, data.value)) return message("O valor não corresponde ao tipo ou às opções do campo.", 400)
          path = "/rest/v1/custom_field_values?on_conflict=workspace_id,definition_id,entity_id"
          prefer += ",resolution=merge-duplicates"
          body = { workspace_id: workspaceId, entity_type: "contact", entity_id: contactId, definition_id: data.definition_id, value: data.value }
        }
      }
    }
    const response = await supabaseRequest(path, { method, headers: { Prefer: prefer }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, token)
    if (!response.ok) {
      if (response.status === 401) return message("Sessão expirada.", 401)
      if (response.status === 403) return message("Seu papel não permite esta alteração.", 403)
      if ([400, 409].includes(response.status)) return message("Dados inválidos, duplicados ou indisponíveis neste workspace.", 400)
      return message("Não foi possível salvar. Tente novamente.", 502)
    }
    const rows = await response.json() as Array<{ id: string }>
    if (!rows.length && method === "DELETE") return message("Alteração não autorizada ou registro indisponível.", 403)
    return NextResponse.json({ saved: true })
  } catch { return message("Não foi possível salvar. Tente novamente.", 502) }
}
