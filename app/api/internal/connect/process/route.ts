import { NextRequest, NextResponse } from "next/server"

import { safeTokenEquals } from "@/lib/classy-connect/meta-webhook"
import { extractConnectInboundMessages } from "@/lib/classy-connect/inbound-parser"
import { supabaseAdminRequest } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

type ClaimedEvent = {
  event_id: string
  claim_id: string
  provider: string
  event_kind: string
  payload: unknown
}

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const workerSecret = process.env.CONNECT_WORKER_TOKEN
  if (!workerSecret || workerSecret.length < 32) {
    return reply({ code: "connect_worker_not_configured" }, 503)
  }
  const header = request.headers.get("authorization")
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : null
  if (!safeTokenEquals(provided, workerSecret)) {
    return reply({ code: "unauthorized" }, 401)
  }

  let claimed: ClaimedEvent[]
  try {
    const response = await supabaseAdminRequest("/rest/v1/rpc/claim_connect_events", {
      method: "POST",
      body: JSON.stringify({ p_limit: 5 }),
    })
    if (!response.ok) return reply({ code: "claim_unavailable" }, 503)
    const value: unknown = await response.json()
    if (!Array.isArray(value)) return reply({ code: "claim_invalid" }, 502)
    claimed = value as ClaimedEvent[]
  } catch {
    return reply({ code: "claim_unavailable" }, 503)
  }

  let processed = 0
  let inserted = 0
  let failed = 0
  for (const event of claimed) {
    let success = true
    let failureCode: string | null = null
    try {
      if (!event.event_id || !event.claim_id) throw new Error("invalid_claim")
      const messages = extractConnectInboundMessages(event.provider, event.payload)
      for (const message of messages) {
        const response = await supabaseAdminRequest(
          "/rest/v1/rpc/record_connect_inbound_message",
          {
            method: "POST",
            body: JSON.stringify({
              p_event_id: event.event_id,
              p_participant_id: message.participant_id,
              p_message_id: message.provider_message_id,
              p_body: message.body,
              p_message_type: message.message_type,
              p_occurred_at: message.occurred_at,
              p_display_name: message.display_name,
            }),
          },
        )
        if (!response.ok) throw new Error("record_failed")
        const created: unknown = await response.json()
        if (created === true) inserted += 1
      }
    } catch {
      success = false
      failureCode = "inbound_processing_failed"
    }

    try {
      const result = await supabaseAdminRequest("/rest/v1/rpc/finish_connect_event", {
        method: "POST",
        body: JSON.stringify({
          p_event_id: event.event_id,
          p_claim_id: event.claim_id,
          p_success: success,
          p_error_code: failureCode,
        }),
      })
      if (!result.ok || await result.json() !== true) {
        failed += 1
        continue
      }
      if (success) processed += 1
      else failed += 1
    } catch {
      failed += 1
    }
  }
  return reply({ claimed: claimed.length, processed, inserted, failed })
}
