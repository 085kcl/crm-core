import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

const emailOrNull = z.union([z.string().trim().email().max(254), z.null()])

const settingsSchema = z.object({
  sender_name: z.string().trim().min(1).max(120),
  sender_email: emailOrNull,
  reply_to: emailOrNull,
  new_request_recipients: z.array(z.string().trim().email().max(254)).max(20),
  customer_confirmation_enabled: z.boolean(),
  company_notification_enabled: z.boolean(),
  status_notifications_enabled: z.boolean(),
}).strict()

type SettingsRow = {
  workspace_id: string
  sender_name: string
  sender_email: string | null
  reply_to: string | null
  new_request_recipients: string[]
  customer_confirmation_enabled: boolean
  company_notification_enabled: boolean
  status_notifications_enabled: boolean
  provider: string
  provider_configuration_ref: string | null
  configuration_version: number
  max_attempts: number
  lease_seconds: number
  updated_at: string
}

function message(text: string, status: number) {
  return NextResponse.json({ message: text }, { status })
}

function workspaceId(request: NextRequest) {
  const value = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  return z.string().uuid().safeParse(value).success ? value! : null
}

function publicSettings(row: SettingsRow) {
  const { provider_configuration_ref, ...safe } = row
  return {
    ...safe,
    provider_configured: Boolean(provider_configuration_ref),
  }
}

export async function GET(request: NextRequest) {
  const selected = workspaceId(request)
  if (!selected) return message("Selecione um workspace.", 400)

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({
      mode: "demo",
      settings: {
        sender_name: "Demonstração",
        sender_email: null,
        reply_to: null,
        new_request_recipients: [],
        customer_confirmation_enabled: false,
        company_notification_enabled: false,
        status_notifications_enabled: false,
        provider: "resend",
        provider_configured: false,
        configuration_version: 1,
        max_attempts: 4,
        lease_seconds: 120,
      },
    })
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)

  const response = await supabaseRequest(
    `/rest/v1/notification_settings?workspace_id=eq.${encodeURIComponent(selected)}&select=workspace_id,sender_name,sender_email,reply_to,new_request_recipients,customer_confirmation_enabled,company_notification_enabled,status_notifications_enabled,provider,provider_configuration_ref,configuration_version,max_attempts,lease_seconds,updated_at&limit=1`,
    {},
    token,
  )

  if (response.status === 401) return message("Sessão expirada.", 401)
  if (!response.ok) return message("Não foi possível carregar as notificações.", 502)

  const rows = (await response.json()) as SettingsRow[]
  if (!rows[0]) {
    return message("Seu papel não permite administrar as notificações.", 403)
  }

  return NextResponse.json({ mode: "live", settings: publicSettings(rows[0]) })
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()

  const selected = workspaceId(request)
  if (!selected) return message("Selecione um workspace.", 400)

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return message("A demonstração é somente leitura.", 403)
  }

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return message("Revise as configurações de notificação.", 400)

  if (
    (parsed.data.customer_confirmation_enabled || parsed.data.company_notification_enabled) &&
    !parsed.data.sender_email
  ) {
    return message("Configure um remetente antes de habilitar notificações.", 400)
  }

  if (
    parsed.data.company_notification_enabled &&
    parsed.data.new_request_recipients.length === 0
  ) {
    return message("Informe ao menos um destinatário interno.", 400)
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)

  const response = await supabaseRequest(
    `/rest/v1/notification_settings?workspace_id=eq.${encodeURIComponent(selected)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(parsed.data),
    },
    token,
  )

  if (response.status === 401) return message("Sessão expirada.", 401)
  if (response.status === 403) {
    return message("Seu papel não permite administrar as notificações.", 403)
  }
  if (!response.ok) return message("Não foi possível salvar as notificações.", 502)

  const rows = (await response.json()) as SettingsRow[]
  if (!rows[0]) {
    return message("Seu papel não permite administrar as notificações.", 403)
  }

  return NextResponse.json({ saved: true, settings: publicSettings(rows[0]) })
}
