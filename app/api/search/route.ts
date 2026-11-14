import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { demoSearch } from "@/lib/crm-v003-demo"
import type { SearchCrmResult } from "@/lib/crm-v003-types"
import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import { supabaseRequest } from "@/lib/supabase-server"

const querySchema = z.string().trim().max(120)

export async function GET(request: NextRequest) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  if (!workspaceId) {
    return NextResponse.json({ message: "Selecione um workspace." }, { status: 400 })
  }

  const parsed = querySchema.safeParse(request.nextUrl.searchParams.get("q") ?? "")
  if (!parsed.success) {
    return NextResponse.json({ message: "A busca deve ter no máximo 120 caracteres." }, { status: 400 })
  }
  if (parsed.data.length < 2) {
    return NextResponse.json({ mode: "live", results: [] })
  }

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({ mode: "demo", results: demoSearch(workspaceId, parsed.data) })
  }

  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!accessToken) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  }

  const response = await supabaseRequest(
    "/rest/v1/rpc/search_crm",
    {
      method: "POST",
      body: JSON.stringify({
        p_workspace_id: workspaceId,
        p_query: parsed.data,
        p_limit: 20,
      }),
    },
    accessToken,
  )

  if (response.status === 401) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  }
  if (response.status === 403) {
    return NextResponse.json({ message: "Acesso ao workspace negado." }, { status: 403 })
  }
  if (!response.ok) {
    return NextResponse.json({ message: "Não foi possível concluir a busca." }, { status: 502 })
  }

  const results = (await response.json()) as SearchCrmResult[]
  return NextResponse.json({ mode: "live", results })
}
