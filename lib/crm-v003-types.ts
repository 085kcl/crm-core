export type CrmEntityType = "contact" | "company" | "lead" | "deal"

export type SearchCrmResult = {
  entity_type: CrmEntityType
  entity_id: string
  title: string
  subtitle: string
  rank: number
}

export type CrmEntityPreview = {
  entity_type: Exclude<CrmEntityType, "contact">
  entity_id: string
  title: string
  subtitle: string
  fields: Array<{
    label: string
    value: string | null
  }>
}

export type CrmEntityPreviewResponse = {
  mode: "demo" | "live"
  entity: CrmEntityPreview
}

export type ContactSummary = {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  document: string | null
  birth_date: string | null
  status: "active" | "inactive" | "archived"
  owner_id: string | null
  created_at: string
  updated_at: string
  primary_company_id: string | null
  primary_company_name: string | null
  company_count: number
  lead_count: number
  open_deal_count: number
  won_deal_count: number
  lost_deal_count: number
  open_pipeline_value: number
  open_task_count: number
  overdue_task_count: number
  tag_count: number
  custom_field_count: number
  last_activity_at: string | null
}

export type ContactCompany = {
  id: string
  trade_name: string
  legal_name: string | null
  tax_id: string | null
  segment: string | null
  relationship_title: string | null
  is_primary: boolean
}

export type ContactLead = {
  id: string
  source: string | null
  score: number
  status: string
  qualification: string | null
  converted_at: string | null
  owner_id: string | null
  owner_name: string | null
  created_at: string
  updated_at: string
}

export type ContactDeal = {
  id: string
  title: string
  amount: number | null
  currency: string
  state: string
  pipeline_id: string
  pipeline_name: string
  stage_id: string
  stage_name: string
  probability: number
  expected_close_date: string | null
  closed_at: string | null
  lost_reason: string | null
  owner_id: string | null
  owner_name: string | null
  created_at: string
  updated_at: string
}

export type ContactTask = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  due_at: string | null
  completed_at: string | null
  assignee_id: string | null
  assignee_name: string | null
  created_at: string
  updated_at: string
}

export type ContactNote = {
  id: string
  body: string
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export type ContactActivity = {
  id: string
  type: string
  metadata: Record<string, unknown>
  actor_id: string | null
  actor_name: string | null
  created_at: string
}

export type ContactTag = {
  id: string
  name: string
  slug: string
  description: string | null
}

export type ContactCustomField = {
  definition_id: string
  key: string
  label: string
  field_type: string
  options: unknown
  is_required: boolean
  position: number
  value_id: string | null
  value: unknown
}

export type Contact360Payload = {
  contact: ContactSummary
  owner: null | { id: string; display_name: string | null; avatar_url: string | null }
  companies: ContactCompany[]
  leads: ContactLead[]
  deals: ContactDeal[]
  tasks: ContactTask[]
  notes: ContactNote[]
  activities: ContactActivity[]
  tags: ContactTag[]
  custom_fields: ContactCustomField[]
}

export type ContactListResponse = {
  mode: "demo" | "live"
  contacts: ContactSummary[]
}

export type Contact360Response = {
  mode: "demo" | "live"
  contact360: Contact360Payload
}

export type SearchCrmResponse = {
  mode: "demo" | "live"
  results: SearchCrmResult[]
}

export function contactDisplayName(contact: Pick<ContactSummary, "first_name" | "last_name">) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ")
}

export function contactInitials(contact: Pick<ContactSummary, "first_name" | "last_name">) {
  return [contact.first_name, contact.last_name]
    .filter(Boolean)
    .map((part) => part!.trim().charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function isTaskOverdue(task: Pick<ContactTask, "due_at" | "status">, now = new Date()) {
  return Boolean(
    task.due_at &&
      task.status !== "completed" &&
      task.status !== "cancelled" &&
      new Date(task.due_at).getTime() < now.getTime(),
  )
}

export function crmEntityHref(result: Pick<SearchCrmResult, "entity_type" | "entity_id">) {
  return result.entity_type === "contact"
    ? `/app/contatos/${result.entity_id}`
    : `/app/entidades/${result.entity_type}/${result.entity_id}`
}
