import { NextRequest, NextResponse } from "next/server"

import { secureTokenMatches } from "@/lib/intake-bridge"
import { sendResendEmail } from "@/lib/resend-adapter"
import { supabaseAdminRequest } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

type ClaimedDelivery = {
  delivery_id: string
  workspace_id: string
  intake_request_id: string
  recipient: string
  template_key: string
  template_variables: Record<string, string | number>
  from_snapshot: string
  reply_to_snapshot: string | null
  provider: "resend"
  delivery_key: string
  attempt_number: number
}

async function rpc<T>(name: string, body: Record<string, unknown>) {
  const response = await supabaseAdminRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  })

  const payload = (await response.json().catch(() => null)) as T
  if (!response.ok) {
    throw new Error(`notification_rpc_failed:${name}`)
  }
  return payload
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  const authorized = await secureTokenMatches(
    request.headers.get("authorization"),
    process.env.CRM_NOTIFICATION_WORKER_TOKEN,
  )

  if (!authorized) {
    return NextResponse.json(
      { code: "worker_unauthorized", correlation_id: correlationId },
      { status: 401 },
    )
  }

  const requested = Number.parseInt(request.nextUrl.searchParams.get("limit") || "10", 10)
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 25) : 10

  const summary = {
    correlation_id: correlationId,
    leases_expired: 0,
    outbox_events_scanned: 0,
    claimed: 0,
    sent: 0,
    retry_scheduled: 0,
    failed: 0,
    reconciliation_required: 0,
  }

  try {
    const expired = await rpc<number>("expire_notification_leases", {})
    summary.leases_expired = Number(expired || 0)

    const materialized = await rpc<number>("materialize_notification_batch", {
      p_limit: limit,
    })
    summary.outbox_events_scanned = Number(materialized || 0)

    for (let index = 0; index < limit; index += 1) {
      const claimedRows = await rpc<ClaimedDelivery[]>("claim_notification_delivery", {
        p_correlation_id: correlationId,
      })
      const delivery = Array.isArray(claimedRows) ? claimedRows[0] : null
      if (!delivery) break

      summary.claimed += 1

      const result = await sendResendEmail({
        recipient: delivery.recipient,
        template_key: delivery.template_key,
        template_variables: delivery.template_variables,
        from_snapshot: delivery.from_snapshot,
        reply_to_snapshot: delivery.reply_to_snapshot,
        delivery_key: delivery.delivery_key,
      })

      const databaseResult = await rpc<string>("record_notification_result", {
        p_delivery_id: delivery.delivery_id,
        p_attempt_number: delivery.attempt_number,
        p_result:
          result.kind === "accepted"
            ? "accepted"
            : result.kind === "unknown"
              ? "unknown"
              : "rejected",
        p_failure_kind: result.kind === "accepted" ? null : result.failureKind,
        p_sanitized_error: result.kind === "accepted" ? null : result.error,
        p_provider_message_id:
          result.kind === "accepted" ? result.providerMessageId : null,
        p_correlation_id: correlationId,
      })

      if (databaseResult === "sent") summary.sent += 1
      else if (databaseResult === "retry_scheduled") summary.retry_scheduled += 1
      else if (databaseResult === "reconciliation_required") {
        summary.reconciliation_required += 1
      } else {
        summary.failed += 1
      }
    }

    return NextResponse.json(summary)
  } catch {
    return NextResponse.json(
      {
        code: "notification_dispatch_failed",
        ...summary,
      },
      { status: 503 },
    )
  }
}
