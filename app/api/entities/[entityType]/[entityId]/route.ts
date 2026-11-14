import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { demoEntityPreview } from "@/lib/crm-v003-demo"
import type { CrmEntityPreview } from "@/lib/crm-v003-types"
import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import { supabaseRequest } from "@/lib/supabase-server"

const entityTypeSchema = z.enum(["company", "lead", "deal"])
const uuidSchema = z.string().uuid()

const entityConfig = {
  company: {
    table: "companies",
    select: "id,trade_name,legal_name,tax_id,website,segment,status,owner_id,created_at,updated_at",
  },
  lead: {
    table: "leads",
    select: "id,contact_id,source,score,status,qualification,converted_at,owner_id,created_at,updated_at",
  },
  deal: {
    table: "deals",
    select: "id,title,amount,currency,state,pipeline_id,stage_id,contact_id,company_id,lead_id,owner_id,expected_close_date,closed_at,lost_reason,created_at,updated_at",
  },
} as const

function genericNotFound() {
  return NextResponse.json({ message: "Registro não encontrado." }, { status: 404 })
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  return String(value)
}

function previewFromRow(
  entityType: keyof typeof entityConfig,
  entityId: string,
  row: Record<string, unknown>,
): CrmEntityPreview {
  if (entityType === "company") {
    return {
      entity_type: entityType,
      entity_id: entityId,
      title: asText(row.trade_name) ?? "Empresa",
      subtitle: asText(row.legal_name) ?? asText(row.tax_id) ?? "",
      fields: [
        { label: "Razão social", value: asText(row.legal_name) },
        { label: "Documento", value: asText(row.tax_id) },
        { label: "Website", value: asText(row.website) },
        { label: "Segmento", value: asText(row.segment) },
        { label: "Status", value: asText(row.status) },
      ],
    }
  }

  if (entityType === "lead") {
    return {
      entity_type: entityType,
      entity_id: entityId,
      title: "Lead",
      subtitle: [asText(row.source), asText(row.status), row.score === null ? null : `Score ${asText(row.score)}`]
        .filter(Boolean)
        .join(" · "),
      fields: [
        { label: "Origem", value: asText(row.source) },
        { label: "Status", value: asText(row.status) },
        { label: "Score", value: asText(row.score) },
        { label: "Qualificação", value: asText(row.qualification) },
        { label: "Convertido em", value: asText(row.converted_at) },
        { label: "Contato", value: asText(row.contact_id) },
      ],
    }
  }

  return {
    entity_type: entityType,
    entity_id: entityId,
    title: asText(row.title) ?? "Negócio",
    subtitle: [asText(row.state), row.amount === null ? null : `${asText(row.currency)} ${asText(row.amount)}`]
      .filter(Boolean)
      .join(" · "),
    fields: [
      { label: "Status", value: asText(row.state) },
      { label: "Valor", value: row.amount === null ? null : `${asText(row.currency)} ${asText(row.amount)}` },
      { label: "Fechamento esperado", value: asText(row.expected_close_date) },
      { label: "Fechado em", value: asText(row.closed_at) },
      { label: "Motivo de perda", value: asText(row.lost_reason) },
      { label: "Contato", value: asText(row.contact_id) },
    ],
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ entityType: string; entityId: string }> },
) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const parsedWorkspaceId = uuidSchema.safeParse(workspaceId)
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ message: "Selecione um workspace." }, { status: 400 })
  }

  const params = await context.params
  const parsedType = entityTypeSchema.safeParse(params.entityType)
  const parsedId = uuidSchema.safeParse(params.entityId)
  if (!parsedType.success || !parsedId.success) return genericNotFound()

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    const entity = demoEntityPreview(parsedWorkspaceId.data, parsedType.data, parsedId.data)
    return entity
      ? NextResponse.json({ mode: "demo", entity })
      : genericNotFound()
  }

  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!accessToken) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  }

  const config = entityConfig[parsedType.data]
  const response = await supabaseRequest(
    `/rest/v1/${config.table}?select=${encodeURIComponent(config.select)}&workspace_id=eq.${parsedWorkspaceId.data}&id=eq.${parsedId.data}&limit=1`,
    {},
    accessToken,
  )

  if (response.status === 401) {
    return NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
  }
  if (response.status === 403) {
    return NextResponse.json({ message: "Acesso ao workspace negado." }, { status: 403 })
  }
  if (!response.ok) {
    return NextResponse.json({ message: "Não foi possível carregar o registro." }, { status: 502 })
  }

  const rows = (await response.json()) as Array<Record<string, unknown>>
  if (!rows[0]) return genericNotFound()

  return NextResponse.json({
    mode: "live",
    entity: previewFromRow(parsedType.data, parsedId.data, rows[0]),
  })
}
