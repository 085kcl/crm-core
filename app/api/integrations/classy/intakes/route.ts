import { NextRequest, NextResponse } from "next/server"

import {
  bridgeBodyWithinLimit,
  canonicalIntakeBody,
  classyBridgeIntakeSchema,
  secureTokenMatches,
  sha256Hex,
} from "@/lib/intake-bridge"
import { supabaseAdminRequest } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

type SubmitResult = {
  created: boolean
  public_reference: string
  received_at: string
  contact_match_state: "new" | "matched" | "needs_review"
  lead_link_state: "created" | "linked" | "pending_review" | "not_required"
}

function safeError(code: string, message: string, status: number, correlationId: string) {
  return NextResponse.json({ code, message, correlation_id: correlationId }, { status })
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID()

  const authorized = await secureTokenMatches(
    request.headers.get("authorization"),
    process.env.CLASSY_BRIDGE_TOKEN,
  )
  if (!authorized) {
    return safeError("bridge_unauthorized", "Integração não autorizada.", 401, correlationId)
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim()
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
    return safeError(
      "invalid_idempotency_key",
      "Envie uma chave de idempotência válida.",
      400,
      correlationId,
    )
  }

  const rawBody = await request.text()
  if (!bridgeBodyWithinLimit(rawBody)) {
    return safeError("payload_too_large", "Solicitação acima do limite permitido.", 413, correlationId)
  }

  let rawJson: unknown
  try {
    rawJson = JSON.parse(rawBody)
  } catch {
    return safeError("invalid_json", "Corpo JSON inválido.", 400, correlationId)
  }

  const parsed = classyBridgeIntakeSchema.safeParse(rawJson)
  if (!parsed.success) {
    return safeError("invalid_intake", "Revise os dados enviados.", 422, correlationId)
  }

  const formKey = process.env.CLASSY_BRIDGE_FORM_KEY?.trim() || "classy-pre-analysis"
  const canonicalBody = canonicalIntakeBody(parsed.data)
  const [idempotencyHash, requestHash] = await Promise.all([
    sha256Hex(`${formKey}:${idempotencyKey}`),
    sha256Hex(canonicalBody),
  ])

  let databaseResponse: Response
  try {
    databaseResponse = await supabaseAdminRequest("/rest/v1/rpc/submit_intake_bridge", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_form_key: formKey,
        p_idempotency_key_hash: idempotencyHash,
        p_request_hash: requestHash,
        p_customer_name: parsed.data.customer_name,
        p_customer_email: parsed.data.customer_email,
        p_customer_phone: parsed.data.customer_phone ?? null,
        p_payload: parsed.data.payload,
        p_correlation_id: correlationId,
        p_external_source_system: "classy_admin",
        p_external_entity_type: "pre_analysis",
        p_external_id: parsed.data.external_id ?? null,
      }),
    })
  } catch {
    return safeError(
      "bridge_unavailable",
      "A integração está temporariamente indisponível.",
      503,
      correlationId,
    )
  }

  const databaseBody = (await databaseResponse.json().catch(() => null)) as
    | SubmitResult[]
    | { message?: string; code?: string }
    | null

  if (!databaseResponse.ok) {
    const databaseMessage =
      databaseBody && !Array.isArray(databaseBody) && typeof databaseBody.message === "string"
        ? databaseBody.message
        : ""

    if (databaseMessage.includes("intake_idempotency_conflict")) {
      return safeError(
        "idempotency_conflict",
        "A chave de idempotência já foi usada com conteúdo diferente.",
        409,
        correlationId,
      )
    }
    if (databaseMessage.includes("intake_form_not_available")) {
      return safeError("form_unavailable", "Formulário indisponível.", 404, correlationId)
    }

    return safeError(
      "intake_persistence_failed",
      "Não foi possível registrar a solicitação.",
      502,
      correlationId,
    )
  }

  const result = Array.isArray(databaseBody) ? databaseBody[0] : null
  if (!result?.public_reference || !result.received_at) {
    return safeError(
      "invalid_persistence_response",
      "Não foi possível confirmar o registro.",
      502,
      correlationId,
    )
  }

  return NextResponse.json(
    {
      public_reference: result.public_reference,
      received_at: result.received_at,
      receipt_state: "registered",
      communication_state: "queued",
      replay: !result.created,
      correlation_id: correlationId,
    },
    { status: result.created ? 201 : 200 },
  )
}
