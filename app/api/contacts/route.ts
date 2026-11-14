import { NextRequest, NextResponse } from "next/server"

import { demoContacts } from "@/lib/crm-v003-demo"
import type { ContactSummary } from "@/lib/crm-v003-types"
import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import { supabaseRequest } from "@/lib/supabase-server"

const contactColumns = [
  "id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "whatsapp",
  "document",
  "birth_date",
  "status",
  "owner_id",
  "created_at",
  "updated_at",
  "primary_company_id",
  "primary_company_name",
  "company_count",
  "lead_count",
  "open_deal_count",
  "won_deal_count",
  "lost_deal_count",
  "open_pipeline_value",
  "open_task_count",
  "overdue_task_count",
  "tag_count",
  "custom_field_count",
  "last_activity_at",
].join(",")

function databaseError(status: number) {
  if (status === 401) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  }
  if (status === 403) {
    return NextResponse.json({ message: "Acesso ao workspace negado." }, { status: 403 })
  }
  return NextResponse.json({ message: "Não foi possível carregar os contatos." }, { status: 502 })
}

export async function GET(request: NextRequest) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  if (!workspaceId) {
    return NextResponse.json({ message: "Selecione um workspace." }, { status: 400 })
  }

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({ mode: "demo", contacts: demoContacts(workspaceId) })
  }

  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!accessToken) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  }

  const response = await supabaseRequest(
    `/rest/v1/contact_360_summary?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=${contactColumns}&order=updated_at.desc&limit=100`,
    { headers: { Accept: "application/json" } },
    accessToken,
  )
  if (!response.ok) return databaseError(response.status)

  const contacts = (await response.json()) as ContactSummary[]
  return NextResponse.json({ mode: "live", contacts })
}
