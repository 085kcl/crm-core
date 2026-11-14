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

const selectionSchema = z.object({ workspaceId: z.string().uuid() })

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ message: "Workspace inválido." }, { status: 400 })

  let workspace: { id: string; name: string } | undefined
  const isDemo = request.cookies.get(CRM_DEMO_COOKIE)?.value === "1"

  if (isDemo) {
    workspace = demoWorkspaces.find((item) => item.id === parsed.data.workspaceId)
  } else {
    const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
    if (!accessToken) return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
    const lookup = await supabaseRequest(
      `/rest/v1/workspaces?id=eq.${encodeURIComponent(parsed.data.workspaceId)}&select=id,name&limit=1`,
      { headers: { Accept: "application/json" } },
      accessToken,
    )
    if (lookup.ok) {
      const rows = (await lookup.json()) as Array<{ id: string; name: string }>
      workspace = rows[0]
    }
  }

  if (!workspace) return NextResponse.json({ message: "Acesso ao workspace negado." }, { status: 403 })

  const response = NextResponse.json({ ok: true, next: "/app" })
  response.cookies.set(CRM_WORKSPACE_COOKIE, workspace.id, {
    ...secureCookie,
    maxAge: 60 * 60 * 8,
  })
  response.cookies.set(CRM_WORKSPACE_NAME_COOKIE, encodeURIComponent(workspace.name), {
    ...secureCookie,
    maxAge: 60 * 60 * 8,
  })
  return response
}
