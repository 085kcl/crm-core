import type {
  Contact360Payload,
  ContactSummary,
  CrmEntityPreview,
  CrmEntityType,
  SearchCrmResult,
} from "@/lib/crm-v003-types"

const primaryWorkspaceId = "11111111-1111-4111-8111-111111111111"
const secondaryWorkspaceId = "22222222-2222-4222-8222-222222222222"

const marianaId = "31000000-0000-4000-8000-000000000001"
const rafaelId = "31000000-0000-4000-8000-000000000002"
const secondaryId = "32000000-0000-4000-8000-000000000001"

const commonSummary = {
  birth_date: null,
  status: "active" as const,
  owner_id: "41000000-0000-4000-8000-000000000001",
  created_at: "2026-08-20T12:00:00.000Z",
  company_count: 1,
  won_deal_count: 0,
  lost_deal_count: 0,
  tag_count: 1,
  custom_field_count: 1,
}

const summariesByWorkspace: Record<string, ContactSummary[]> = {
  [primaryWorkspaceId]: [
    {
      ...commonSummary,
      id: marianaId,
      first_name: "Mariana",
      last_name: "Costa",
      email: "mariana.costa@example.com",
      phone: "+55 11 98888-1204",
      whatsapp: "+55 11 98888-1204",
      document: "123.456.789-09",
      updated_at: "2026-09-01T12:18:00.000Z",
      primary_company_id: "51000000-0000-4000-8000-000000000001",
      primary_company_name: "Grupo Atlas",
      lead_count: 1,
      open_deal_count: 1,
      open_pipeline_value: 84000,
      open_task_count: 2,
      overdue_task_count: 1,
      last_activity_at: "2026-09-01T12:18:00.000Z",
    },
    {
      ...commonSummary,
      id: rafaelId,
      first_name: "Rafael",
      last_name: "Mendes",
      email: "rafael.mendes@example.com",
      phone: "+55 21 97777-4488",
      whatsapp: "+55 21 97777-4488",
      document: "987.654.321-00",
      updated_at: "2026-08-31T15:42:00.000Z",
      primary_company_id: "51000000-0000-4000-8000-000000000002",
      primary_company_name: "Mendes & Lima",
      lead_count: 1,
      open_deal_count: 0,
      open_pipeline_value: 0,
      open_task_count: 1,
      overdue_task_count: 0,
      last_activity_at: "2026-08-31T15:42:00.000Z",
    },
  ],
  [secondaryWorkspaceId]: [
    {
      ...commonSummary,
      id: secondaryId,
      first_name: "Helena",
      last_name: "Prado",
      email: "helena.prado@example.com",
      phone: "+55 31 96666-3300",
      whatsapp: null,
      document: null,
      updated_at: "2026-08-30T10:00:00.000Z",
      primary_company_id: null,
      primary_company_name: null,
      company_count: 0,
      lead_count: 0,
      open_deal_count: 0,
      open_pipeline_value: 0,
      open_task_count: 0,
      overdue_task_count: 0,
      tag_count: 0,
      custom_field_count: 0,
      last_activity_at: null,
    },
  ],
}

function payloadFromSummary(contact: ContactSummary): Contact360Payload {
  const isMariana = contact.id === marianaId
  return {
    contact,
    owner: {
      id: contact.owner_id!,
      display_name: "João Duarte",
      avatar_url: null,
    },
    companies: contact.primary_company_id
      ? [{
          id: contact.primary_company_id,
          trade_name: contact.primary_company_name!,
          legal_name: isMariana ? "Atlas Consultoria Ltda." : "Mendes & Lima Serviços Ltda.",
          tax_id: isMariana ? "12.345.678/0001-90" : "98.765.432/0001-10",
          segment: "Serviços profissionais",
          relationship_title: isMariana ? "Diretora financeira" : "Sócio",
          is_primary: true,
        }]
      : [],
    leads: contact.lead_count
      ? [{
          id: isMariana ? "61000000-0000-4000-8000-000000000001" : "61000000-0000-4000-8000-000000000002",
          source: "Site",
          score: isMariana ? 82 : 64,
          status: isMariana ? "qualified" : "working",
          qualification: isMariana ? "Interesse confirmado em análise patrimonial." : "Primeiro diagnóstico agendado.",
          converted_at: null,
          owner_id: contact.owner_id,
          owner_name: "João Duarte",
          created_at: "2026-08-25T14:00:00.000Z",
          updated_at: contact.updated_at,
        }]
      : [],
    deals: isMariana
      ? [{
          id: "71000000-0000-4000-8000-000000000001",
          title: "Diagnóstico patrimonial · Grupo Atlas",
          amount: 84000,
          currency: "BRL",
          state: "open",
          pipeline_id: "72000000-0000-4000-8000-000000000001",
          pipeline_name: "Comercial principal",
          stage_id: "73000000-0000-4000-8000-000000000001",
          stage_name: "Proposta",
          probability: 60,
          expected_close_date: "2026-09-18",
          closed_at: null,
          lost_reason: null,
          owner_id: contact.owner_id,
          owner_name: "João Duarte",
          created_at: "2026-08-27T09:30:00.000Z",
          updated_at: "2026-09-01T11:50:00.000Z",
        }]
      : [],
    tasks: isMariana
      ? [
          {
            id: "81000000-0000-4000-8000-000000000001",
            title: "Retornar análise documental",
            description: "Apresentar os pontos críticos do material recebido.",
            priority: "high",
            status: "open",
            due_at: "2026-08-31T17:30:00.000Z",
            completed_at: null,
            assignee_id: contact.owner_id,
            assignee_name: "João Duarte",
            created_at: "2026-08-29T12:00:00.000Z",
            updated_at: "2026-08-29T12:00:00.000Z",
          },
          {
            id: "81000000-0000-4000-8000-000000000002",
            title: "Confirmar reunião de proposta",
            description: null,
            priority: "normal",
            status: "in_progress",
            due_at: "2026-09-03T13:00:00.000Z",
            completed_at: null,
            assignee_id: contact.owner_id,
            assignee_name: "João Duarte",
            created_at: "2026-09-01T10:00:00.000Z",
            updated_at: "2026-09-01T10:00:00.000Z",
          },
        ]
      : [],
    notes: isMariana
      ? [{
          id: "91000000-0000-4000-8000-000000000001",
          body: "Prefere receber retornos após as 16h. A diretoria participa da próxima reunião.",
          created_by: contact.owner_id,
          created_by_name: "João Duarte",
          created_at: "2026-09-01T10:42:00.000Z",
          updated_at: "2026-09-01T10:42:00.000Z",
        }]
      : [],
    activities: isMariana
      ? [
          {
            id: "a1000000-0000-4000-8000-000000000001",
            type: "deal_stage_changed",
            metadata: { title: "Negócio avançou para Proposta", stage: "Proposta" },
            actor_id: contact.owner_id,
            actor_name: "João Duarte",
            created_at: "2026-09-01T12:18:00.000Z",
          },
          {
            id: "a1000000-0000-4000-8000-000000000002",
            type: "note_created",
            metadata: { title: "Nota adicionada" },
            actor_id: contact.owner_id,
            actor_name: "João Duarte",
            created_at: "2026-09-01T10:42:00.000Z",
          },
        ]
      : [],
    tags: contact.tag_count
      ? [{
          id: "b1000000-0000-4000-8000-000000000001",
          name: isMariana ? "Alta prioridade" : "Diagnóstico",
          slug: isMariana ? "alta-prioridade" : "diagnostico",
          description: null,
        }]
      : [],
    custom_fields: contact.custom_field_count
      ? [{
          definition_id: "c1000000-0000-4000-8000-000000000001",
          key: "canal_preferido",
          label: "Canal preferido",
          field_type: "select",
          options: ["E-mail", "Telefone", "WhatsApp"],
          is_required: false,
          position: 0,
          value_id: "c2000000-0000-4000-8000-000000000001",
          value: isMariana ? "WhatsApp" : "Telefone",
        }]
      : [],
  }
}

export function demoContacts(workspaceId: string) {
  return summariesByWorkspace[workspaceId] ?? []
}

export function demoContact360(workspaceId: string, contactId: string) {
  const contact = demoContacts(workspaceId).find((item) => item.id === contactId)
  return contact ? payloadFromSummary(contact) : null
}

export function demoSearch(workspaceId: string, rawQuery: string): SearchCrmResult[] {
  const query = rawQuery.trim().toLocaleLowerCase("pt-BR")
  if (query.length < 2) return []

  const contacts = demoContacts(workspaceId).flatMap<SearchCrmResult>((contact) => {
    const searchable = [
      contact.first_name,
      contact.last_name,
      contact.email,
      contact.phone,
      contact.whatsapp,
      contact.document,
    ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR")
    if (!searchable.includes(query)) return []
    return [{
      entity_type: "contact",
      entity_id: contact.id,
      title: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
      subtitle: contact.email ?? contact.phone ?? "",
      rank: 1,
    }]
  })

  if (workspaceId !== primaryWorkspaceId) return contacts

  const related: SearchCrmResult[] = [
    { entity_type: "company", entity_id: "51000000-0000-4000-8000-000000000001", title: "Grupo Atlas", subtitle: "Atlas Consultoria Ltda.", rank: 0.9 },
    { entity_type: "lead", entity_id: "61000000-0000-4000-8000-000000000001", title: "Lead · Mariana Costa", subtitle: "Site · qualified · Score 82", rank: 0.8 },
    { entity_type: "deal", entity_id: "71000000-0000-4000-8000-000000000001", title: "Diagnóstico patrimonial · Grupo Atlas", subtitle: "open · BRL 84000", rank: 0.8 },
  ].filter((item) => `${item.title} ${item.subtitle}`.toLocaleLowerCase("pt-BR").includes(query)) as SearchCrmResult[]

  return [...contacts, ...related].sort((a, b) => b.rank - a.rank).slice(0, 20)
}

export function demoEntityPreview(
  workspaceId: string,
  entityType: Exclude<CrmEntityType, "contact">,
  entityId: string,
): CrmEntityPreview | null {
  if (workspaceId !== primaryWorkspaceId) return null

  const contact360 = demoContact360(workspaceId, marianaId)
  if (!contact360) return null

  if (entityType === "company") {
    const company = contact360.companies.find((item) => item.id === entityId)
    return company ? {
      entity_type: entityType,
      entity_id: entityId,
      title: company.trade_name,
      subtitle: company.legal_name ?? company.tax_id ?? "",
      fields: [
        { label: "Razão social", value: company.legal_name },
        { label: "Documento", value: company.tax_id },
        { label: "Segmento", value: company.segment },
        { label: "Relacionamento", value: company.relationship_title },
      ],
    } : null
  }

  if (entityType === "lead") {
    const lead = contact360.leads.find((item) => item.id === entityId)
    return lead ? {
      entity_type: entityType,
      entity_id: entityId,
      title: "Lead · Mariana Costa",
      subtitle: [lead.source, lead.status, `Score ${lead.score}`].filter(Boolean).join(" · "),
      fields: [
        { label: "Origem", value: lead.source },
        { label: "Status", value: lead.status },
        { label: "Score", value: String(lead.score) },
        { label: "Qualificação", value: lead.qualification },
        { label: "Responsável", value: lead.owner_name },
      ],
    } : null
  }

  const deal = contact360.deals.find((item) => item.id === entityId)
  return deal ? {
    entity_type: entityType,
    entity_id: entityId,
    title: deal.title,
    subtitle: [deal.state, deal.amount === null ? null : `${deal.currency} ${deal.amount}`]
      .filter(Boolean)
      .join(" · "),
    fields: [
      { label: "Pipeline", value: deal.pipeline_name },
      { label: "Etapa", value: deal.stage_name },
      { label: "Probabilidade", value: `${deal.probability}%` },
      { label: "Responsável", value: deal.owner_name },
      { label: "Fechamento esperado", value: deal.expected_close_date },
    ],
  } : null
}
