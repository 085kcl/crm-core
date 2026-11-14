import { NextRequest, NextResponse } from "next/server"
import {
  prepareMetaWebhookEvents,
  safeTokenEquals,
  verifyMetaWebhookSignature,
} from "@/lib/classy-connect/meta-webhook"
import { supabaseAdminRequest } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024

function noStoreHeaders() {
  return { "Cache-Control": "no-store" }
}

// Read at most the configured body limit, even with missing/forged Content-Length.
// The signature below must still be calculated over the original, exact bytes.
async function readBoundedBody(request: NextRequest): Promise<string | null> {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  const data = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(data)
}


// Meta subscription handshake. Does not authenticate customers or alter CRM data.
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const valid = params.get("hub.mode") === "subscribe" &&
    safeTokenEquals(params.get("hub.verify_token"), process.env.META_WEBHOOK_VERIFY_TOKEN)
  const challenge = params.get("hub.challenge")

  if (!valid || !challenge || !/^\d{1,128}$/.test(challenge)) {
    return new Response("Forbidden", { status: 403, headers: noStoreHeaders() })
  }
  return new Response(challenge, { status: 200, headers: {
    ...noStoreHeaders(), "Content-Type": "text/plain; charset=utf-8",
  } })
}

// Webhook is intentionally receive-only. Nothing here sends customer messages.
export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret || !process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ code: "connect_not_configured", correlation_id: correlationId },
      { status: 503, headers: noStoreHeaders() })
  }

  const declaredSize = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ code: "payload_too_large", correlation_id: correlationId },
      { status: 413, headers: noStoreHeaders() })
  }

  let rawBody: string | null
  try {
    rawBody = await readBoundedBody(request)
  } catch {
    return NextResponse.json({ code: "body_unreadable", correlation_id: correlationId },
      { status: 400, headers: noStoreHeaders() })
  }
  if (rawBody === null) {
    return NextResponse.json({ code: "payload_too_large", correlation_id: correlationId },
      { status: 413, headers: noStoreHeaders() })
  }

  if (!await verifyMetaWebhookSignature(
    rawBody, request.headers.get("x-hub-signature-256"), appSecret,
  )) {
    return NextResponse.json({ code: "invalid_signature", correlation_id: correlationId },
      { status: 401, headers: noStoreHeaders() })
  }

  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ code: "invalid_json", correlation_id: correlationId },
      { status: 400, headers: noStoreHeaders() })
  }

  const events = await prepareMetaWebhookEvents(parsedPayload)
  if (!events) {
    return NextResponse.json({ code: "unsupported_payload", correlation_id: correlationId },
      { status: 422, headers: noStoreHeaders() })
  }

  // Empty batches acknowledge known Meta objects without tenant association.
  if (events.length === 0) {
    return new Response("EVENT_RECEIVED", { status: 200, headers: noStoreHeaders() })
  }

  try {
    const response = await supabaseAdminRequest(
      "/rest/v1/rpc/ingest_connect_webhook_events",
      {
        method: "POST",
        body: JSON.stringify({ p_events: events }),
      },
    )
    if (!response.ok) {
      // Non-2xx lets Meta retry transient persistence failures.
      return NextResponse.json({ code: "connect_ingest_unavailable", correlation_id: correlationId },
        { status: 503, headers: noStoreHeaders() })
    }
  } catch {
    return NextResponse.json({ code: "connect_ingest_unavailable", correlation_id: correlationId },
      { status: 503, headers: noStoreHeaders() })
  }

  return new Response("EVENT_RECEIVED", { status: 200, headers: noStoreHeaders() })
}
