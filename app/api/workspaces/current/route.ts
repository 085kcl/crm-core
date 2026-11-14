import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
  CRM_WORKSPACE_NAME_COOKIE,
  demoWorkspaces,
  secureCookie,
} from "@/lib/crm-session"
import { supabaseRequest } from "@/lib/supabase-server"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  status: z.enum(["active", "inactive", "archived"]),
})

function selectedWorkspaceId(request: NextRequest) {
  return request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
}

export async function GET(request: NextRequest) {
  const workspaceId = selectedWorkspaceId(request)
  if (!workspaceId) return NextResponse.json({ message: "Selecione um workspace." }, { status: 400 })

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    const workspace = demoWorkspaces.find((item) => item.id === workspaceId)
    if (!workspace) return NextResponse.json({ message: "Workspace não encontrado." }, { status: 404 })
    return NextResponse.json({ mode: "demo", workspace })
  }

  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!accessToken) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  const lookup = await supabaseRequest(
    `/rest/v1/workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=id,name,slug,status&limit=1`,
    { headers: { Accept: "application/json" } },
    accessToken,
  )
  if (!lookup.ok) return NextResponse.json({ message: "Não foi possível carregar o workspace." }, { status: lookup.status === 401 ? 401 : 502 })
  const rows = (await lookup.json()) as Array<{ id: string; name: string; slug: string; status: string }>
  if (!rows[0]) return NextResponse.json({ message: "Workspace não encontrado." }, { status: 404 })
  return NextResponse.json({ mode: "live", workspace: rows[0] })
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const workspaceId = selectedWorkspaceId(request)
  if (!workspaceId) return NextResponse.json({ message: "Selecione um workspace." }, { status: 400 })
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ message: "Revise os dados do workspace." }, { status: 400 })

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    const current = demoWorkspaces.find((item) => item.id === workspaceId)
    if (!current) return NextResponse.json({ message: "Workspace não encontrado." }, { status: 404 })
    const response = NextResponse.json({
      mode: "demo",
      workspace: { ...current, ...parsed.data, transient: true },
    })
    response.cookies.set(CRM_WORKSPACE_NAME_COOKIE, encodeURIComponent(parsed.data.name), {
      ...secureCookie,
      maxAge: 60 * 60 * 8,
    })
    return response
  }

  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!accessToken) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  const updated = await supabaseRequest(
    `/rest/v1/workspaces?id=eq.${encodeURIComponent(workspaceId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(parsed.data),
    },
    accessToken,
  )
  if (!updated.ok) {
    return NextResponse.json(
      { message: updated.status === 403 ? "Seu papel não permite alterar este workspace." : "Não foi possível salvar as alterações." },
      { status: updated.status === 403 ? 403 : 502 },
    )
  }
  const rows = (await updated.json()) as Array<{ id: string; name: string; slug: string; status: string }>
  if (!rows[0]) return NextResponse.json({ message: "Alteração não autorizada." }, { status: 403 })
  const response = NextResponse.json({ mode: "live", workspace: rows[0] })
  response.cookies.set(CRM_WORKSPACE_NAME_COOKIE, encodeURIComponent(rows[0].name), {
    ...secureCookie,
    maxAge: 60 * 60 * 8,
  })
  return response
}
