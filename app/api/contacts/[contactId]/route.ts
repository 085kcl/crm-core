import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { demoContact360 } from "@/lib/crm-v003-demo"
import type { Contact360Payload } from "@/lib/crm-v003-types"
import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import { supabaseRequest } from "@/lib/supabase-server"

const contactIdSchema = z.string().uuid()

function genericNotFound() {
  return NextResponse.json({ message: "Contato não encontrado." }, { status: 404 })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contactId: string }> },
) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  if (!workspaceId) {
    return NextResponse.json({ message: "Selecione um workspace." }, { status: 400 })
  }

  const parsedId = contactIdSchema.safeParse((await context.params).contactId)
  if (!parsedId.success) return genericNotFound()

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    const contact360 = demoContact360(workspaceId, parsedId.data)
    return contact360
      ? NextResponse.json({ mode: "demo", contact360 })
      : genericNotFound()
  }

  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!accessToken) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  }

  const response = await supabaseRequest(
    "/rest/v1/rpc/get_contact_360",
    {
      method: "POST",
      body: JSON.stringify({
        p_workspace_id: workspaceId,
        p_contact_id: parsedId.data,
        p_activity_limit: 50,
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
    return NextResponse.json({ message: "Não foi possível carregar o contato." }, { status: 502 })
  }

  const contact360 = (await response.json()) as Contact360Payload | null
  return contact360
    ? NextResponse.json({ mode: "live", contact360 })
    : genericNotFound()
}
