import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { sha256Hex } from "@/lib/intake-bridge"
import { supabaseAdminRequest } from "@/lib/supabase-admin"
import { verifySvixWebhook } from "@/lib/svix-webhook"

export const dynamic = "force-dynamic"

const eventSchema = z.object({
  type: z.string().min(1),
  created_at: z.string().min(1),
  data: z.object({
    email_id: z.string().min(1),
  }).passthrough(),
}).passthrough()

const acceptedEvents = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.failed",
  "email.bounced",
  "email.suppressed",
  "email.complained",
])

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > 128 * 1024) {
    return NextResponse.json({ code: "payload_too_large" }, { status: 413 })
  }

  const valid = await verifySvixWebhook(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    process.env.RESEND_WEBHOOK_SECRET,
  )

  if (!valid) {
    return NextResponse.json({ code: "invalid_webhook_signature" }, { status: 400 })
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ code: "invalid_json" }, { status: 400 })
  }

  const parsed = eventSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return NextResponse.json({ code: "invalid_event_shape" }, { status: 400 })
  }

  const svixId = request.headers.get("svix-id")
  if (!svixId) {
    return NextResponse.json({ code: "missing_event_id" }, { status: 400 })
  }

  if (!acceptedEvents.has(parsed.data.type)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const createdAt = new Date(parsed.data.created_at)
  if (Number.isNaN(createdAt.getTime())) {
    return NextResponse.json({ code: "invalid_event_timestamp" }, { status: 400 })
  }

  const payloadHash = await sha256Hex(rawBody)

  const response = await supabaseAdminRequest("/rest/v1/rpc/record_resend_webhook_event", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_provider_event_id: svixId,
      p_event_type: parsed.data.type,
      p_provider_message_id: parsed.data.data.email_id,
      p_event_created_at: createdAt.toISOString(),
      p_payload_hash: payloadHash,
    }),
  })

  if (!response.ok) {
    return NextResponse.json({ code: "webhook_persistence_failed" }, { status: 503 })
  }

  const result = (await response.json().catch(() => null)) as string | null
  return NextResponse.json({ ok: true, result: result ?? "processed" })
}
