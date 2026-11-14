import { z } from "zod"
import type { ContactCustomField } from "@/lib/crm-v003-types"

export const fieldTypes = ["text", "textarea", "integer", "decimal", "currency", "boolean", "date", "datetime", "select", "multiselect", "email", "phone", "url"] as const

export const metadataMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_tag"), name: z.string().trim().min(1).max(80), slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/) }).strict(),
  z.object({ action: z.literal("attach_tag"), tag_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("remove_tag"), tag_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("create_field"), key: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/), label: z.string().trim().min(1).max(120), field_type: z.enum(fieldTypes), options: z.array(z.string().trim().min(1).max(200)).max(100), is_required: z.boolean(), position: z.number().int().min(0).max(10000) }).strict(),
  z.object({ action: z.literal("save_field"), definition_id: z.string().uuid(), value: z.unknown().refine((value) => value !== undefined && value !== null) }).strict(),
  z.object({ action: z.literal("clear_field"), definition_id: z.string().uuid() }).strict(),
])

export function fieldOptions(field: Pick<ContactCustomField, "options">): string[] {
  return Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === "string") : []
}

export function validFieldValue(field: Pick<ContactCustomField, "field_type" | "options" | "is_required">, value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (["integer", "decimal", "currency"].includes(field.field_type)) return typeof value === "number" && Number.isFinite(value) && (field.field_type !== "integer" || Number.isSafeInteger(value))
  if (field.field_type === "boolean") return typeof value === "boolean"
  const options = fieldOptions(field)
  if (field.field_type === "multiselect") return Array.isArray(value) && (!field.is_required || value.length > 0) && value.every((item) => typeof item === "string" && (!options.length || options.includes(item)))
  if (typeof value !== "string" || value.length > 10000 || (field.is_required && !value.trim())) return false
  switch (field.field_type) {
    case "select": return !options.length || options.includes(value)
    case "email": return z.string().email().safeParse(value).success
    case "url": return z.string().url().safeParse(value).success && /^https?:\/\//i.test(value)
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
    case "datetime": return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))
    default: return ["text", "textarea", "phone"].includes(field.field_type)
  }
}
