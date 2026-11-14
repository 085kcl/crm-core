import { NextRequest, NextResponse } from "next/server"

import { safeTokenEquals } from "@/lib/classy-connect/meta-webhook"
import { supabaseAdminRequest } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

type QueueHealth = {
  queued: number
  processing: number
  retry_wait: number
  dead_letters: number
  processed: number
  active_channels: number
  oldest_pending_at: string | null
}

function reply(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

// Read-only operational endpoint; not callable from the browser UI.
export async function GET(request: NextRequest) {
  const secret = process.env.CONNECT_WORKER_TOKEN
  if (!secret || secret.length < 32) {
    return reply({ code: "connect_health_not_configured" }, 503)
  }

  const bearer = request.headers.get("authorization")
  const supplied = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null
  if (!safeTokenEquals(supplied, secret)) {
    return reply({ code: "unauthorized" }, 401)
  }

  try {
    const response = await supabaseAdminRequest(
      "/rest/v1/rpc/connect_ingress_health",
      { method: "POST", body: "{}" },
    )
    if (!response.ok) return reply({ code: "connect_health_unavailable" }, 503)

    const data = (await response.json()) as QueueHealth | null
    if (!data || typeof data !== "object" ||
      !["queued", "processing", "retry_wait", "dead_letters", "processed", "active_channels"]
        .every((key) => Number.isSafeInteger(data[key as keyof QueueHealth]) &&
          Number(data[key as keyof QueueHealth]) >= 0) ||
      !(data.oldest_pending_at === null ||
        (typeof data.oldest_pending_at === "string" &&
          Number.isFinite(Date.parse(data.oldest_pending_at))))) {
      return reply({ code: "connect_health_invalid" }, 502)
    }

    return reply({
      queued: data.queued,
      processing: data.processing,
      retry_wait: data.retry_wait,
      dead_letters: data.dead_letters,
      processed: data.processed,
      active_channels: data.active_channels,
      oldest_pending_at: data.oldest_pending_at,
    })
  } catch {
    return reply({ code: "connect_health_unavailable" }, 503)
  }
}
