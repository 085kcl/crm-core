export {}

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const encoder = new TextEncoder()
const MAX_BODY_BYTES = 32_000

function adminHeaders(): Record<string, string> {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
  if (legacy) {
    return {
      apikey: legacy,
      Authorization: `Bearer ${legacy}`,
      "Content-Type": "application/json",
    }
  }
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"
  const parsed = JSON.parse(raw)
  const key = String(parsed.default || "").trim()
  if (!key) throw new Error("supabase_admin_key_missing")
  return { apikey: key, "Content-Type": "application/json" }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "")
if (!supabaseUrl) throw new Error("supabase_url_missing")

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const problem = payload as { code?: unknown; message?: unknown } | null
    if (
      name === "submit_intake_bridge" &&
      problem?.code === "23505" &&
      (problem.message === "intake_idempotency_conflict" ||
        problem.message === "integration_external_id_conflict")
    ) {
      throw new Error("bridge_conflict")
    }
    throw new Error(`rpc_failed:${name}`)
  }
  return payload as T
}

async function getSecret(name: string): Promise<string> {
  const value = await rpc<string>("get_notification_runtime_secret", { p_name: name })
  if (typeof value !== "string" || !value) throw new Error("runtime_secret_missing")
  return value
}

function timingSafeEqual(left: string, right: string) {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

function text(value: unknown, max: number, required = false) {
  const normalized = typeof value === "string" ? value.trim().slice(0, max) : ""
  if (required && !normalized) throw new Error("invalid_payload")
  return normalized
}

function email(value: unknown) {
  const normalized = text(value, 160, true).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("invalid_payload")
  return normalized
}

function phone(value: unknown) {
  const normalized = text(value, 30, true)
  const digits = normalized.replace(/\D/g, "")
  if (digits.length < 10 || digits.length > 15) throw new Error("invalid_payload")
  return normalized
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

type BridgeResult = {
  created: boolean
  public_reference: string
  received_at: string
  contact_match_state: string
  lead_link_state: string
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 })

  const correlationId = crypto.randomUUID()
  const contentLength = Number(request.headers.get("content-length") || "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ code: "payload_too_large", correlation_id: correlationId }, { status: 413 })
  }

  try {
    const expectedToken = await getSecret("crm_classy_bridge_token")
    const authorization = request.headers.get("authorization") || ""
    if (!timingSafeEqual(authorization, `Bearer ${expectedToken}`)) {
      return Response.json({ code: "bridge_unauthorized", correlation_id: correlationId }, { status: 401 })
    }

    const raw = await request.text()
    if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) {
      return Response.json({ code: "payload_too_large", correlation_id: correlationId }, { status: 413 })
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return Response.json({ code: "invalid_json", correlation_id: correlationId }, { status: 400 })
    }

    const externalId = text(payload.externalId, 100, true)
    const protocol = text(payload.protocol, 100, true)
    const name = text(payload.name, 120, true)
    const customerEmail = email(payload.email)
    const customerPhone = phone(payload.phone)
    const sourceData =
      payload.data && typeof payload.data === "object"
        ? payload.data as Record<string, unknown>
        : {}

    const crmPayload = {
      schema_version: 1,
      source: "classy-site",
      source_protocol: protocol,
      ...sourceData,
    }

    const idemHash = await sha256Hex(`classy-site:lead:${externalId}`)
    const requestHash = await sha256Hex(canonicalize({
      externalId,
      protocol,
      name,
      email: customerEmail,
      phone: customerPhone,
      data: crmPayload,
    }))

    const rows = await rpc<BridgeResult[]>("submit_intake_bridge", {
      p_form_key: "classy-pre-analysis",
      p_idempotency_key_hash: idemHash,
      p_request_hash: requestHash,
      p_customer_name: name,
      p_customer_email: customerEmail,
      p_customer_phone: customerPhone,
      p_payload: crmPayload,
      p_correlation_id: correlationId,
      p_external_source_system: "classy_site",
      p_external_entity_type: "lead",
      p_external_id: externalId,
    })

    const result = Array.isArray(rows) ? rows[0] : null
    if (!result) throw new Error("bridge_result_missing")

    return Response.json({
      created: result.created,
      public_reference: result.public_reference,
      received_at: result.received_at,
      contact_match_state: result.contact_match_state,
      lead_link_state: result.lead_link_state,
      correlation_id: correlationId,
    }, { status: result.created ? 201 : 200 })
  } catch (error) {
    const code = error instanceof Error ? error.message : "bridge_failed"
    if (code === "invalid_payload") {
      return Response.json({ code, correlation_id: correlationId }, { status: 400 })
    }
    if (code === "bridge_conflict") {
      return Response.json({ code, correlation_id: correlationId }, { status: 409 })
    }
    return Response.json({ code: "bridge_failed", correlation_id: correlationId }, { status: 503 })
  }
})
