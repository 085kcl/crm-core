import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_DEMO_COOKIE,
  CRM_WORKSPACE_COOKIE,
} from "@/lib/crm-session"
import {
  canRetryNotification,
  getWorkspaceMemberContext,
} from "@/lib/current-workspace-member"
import { supabaseRequest } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ intakeId: string }> }

type Delivery = {
  id: string
  event_type: string
  intent_key: string
  recipient: string
  template_key: string
  provider: string
  status: string
  attempt_count: number
  last_error: string | null
  queued_at: string
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  failure_kind: string | null
  retryable: boolean
  reconciliation_required: boolean
}

type Attempt = {
  delivery_id: string
  attempt_number: number
  started_at: string
  finished_at: string | null
  result: string
  failure_kind: string | null
  sanitized_error: string | null
}

function message(text: string, status: number) {
  return NextResponse.json({ message: text }, { status })
}

export async function GET(request: NextRequest, context: Context) {
  const workspaceId = request.cookies.get(CRM_WORKSPACE_COOKIE)?.value
  const intakeId = (await context.params).intakeId

  if (
    !z.string().uuid().safeParse(workspaceId).success ||
    !z.string().uuid().safeParse(intakeId).success
  ) {
    return message("Solicitação não encontrada.", 404)
  }

  if (request.cookies.get(CRM_DEMO_COOKIE)?.value === "1") {
    return NextResponse.json({ mode: "demo", deliveries: [] })
  }

  const token = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (!token) return message("Sessão expirada.", 401)

  const member = await getWorkspaceMemberContext(token, workspaceId!)
  if (!member) return message("Solicitação não encontrada.", 404)

  const intakeResponse = await supabaseRequest(
    `/rest/v1/intake_requests?workspace_id=eq.${workspaceId}&id=eq.${intakeId}&select=id&limit=1`,
    {},
    token,
  )
  if (intakeResponse.status === 401) return message("Sessão expirada.", 401)
  if (!intakeResponse.ok) return message("Não foi possível carregar a solicitação.", 502)

  const intakeRows = (await intakeResponse.json()) as Array<{ id: string }>
  if (!intakeRows[0]) return message("Solicitação não encontrada.", 404)

  const deliveryResponse = await supabaseRequest(
    `/rest/v1/notification_deliveries?workspace_id=eq.${workspaceId}&intake_request_id=eq.${intakeId}&select=id,event_type,intent_key,recipient,template_key,provider,status,attempt_count,last_error,queued_at,sent_at,delivered_at,failed_at,failure_kind,retryable,reconciliation_required&order=queued_at.desc,id.desc&limit=100`,
    {},
    token,
  )
  if (!deliveryResponse.ok) {
    return message("Não foi possível carregar o histórico de comunicações.", 502)
  }

  const deliveries = (await deliveryResponse.json()) as Delivery[]
  if (deliveries.length === 0) {
    return NextResponse.json({
      mode: "live",
      role: member.role,
      can_retry: canRetryNotification(member.role),
      deliveries: [],
    })
  }

  if (member.role === "viewer") {
    return NextResponse.json({
      mode: "live",
      role: member.role,
      can_retry: false,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        event_type: delivery.event_type,
        intent_key: delivery.intent_key,
        status: delivery.status,
        queued_at: delivery.queued_at,
        sent_at: delivery.sent_at,
        delivered_at: delivery.delivered_at,
        failed_at: delivery.failed_at,
        retryable: false,
        reconciliation_required: delivery.reconciliation_required,
        recipient: null,
        template_key: null,
        provider: null,
        attempt_count: delivery.attempt_count,
        last_error: null,
        failure_kind: null,
        attempts: [],
      })),
    })
  }

  const ids = deliveries.map((item) => item.id)
  const attemptResponse = await supabaseRequest(
    `/rest/v1/notification_delivery_attempts?workspace_id=eq.${workspaceId}&delivery_id=in.(${ids.join(",")})&select=delivery_id,attempt_number,started_at,finished_at,result,failure_kind,sanitized_error&order=attempt_number.desc&limit=500`,
    {},
    token,
  )
  if (!attemptResponse.ok) {
    return message("Não foi possível carregar as tentativas de comunicação.", 502)
  }

  const attempts = (await attemptResponse.json()) as Attempt[]
  const byDelivery = new Map<string, Attempt[]>()
  for (const attempt of attempts) {
    const current = byDelivery.get(attempt.delivery_id) || []
    current.push(attempt)
    byDelivery.set(attempt.delivery_id, current)
  }

  return NextResponse.json({
    mode: "live",
    role: member.role,
    can_retry: canRetryNotification(member.role),
    deliveries: deliveries.map((delivery) => ({
      ...delivery,
      attempts: byDelivery.get(delivery.id) || [],
    })),
  })
}
