export {}

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

type CommandBody =
  | {
      command: "assign"
      workspace_id: string
      intake_id: string
      assigned_to: string | null
      expected_version: number
      request_id: string
    }
  | {
      command: "retry_notification"
      workspace_id: string
      delivery_id: string
      reason: string
    }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

  return {
    apikey: key,
    "Content-Type": "application/json",
  }
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "")
if (!supabaseUrl) throw new Error("supabase_url_missing")

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return atob(normalized + padding)
}

function actorFromAuthorization(request: Request) {
  const authorization = request.headers.get("authorization") || ""
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  const payload = token.split(".")[1]
  if (!payload) return null

  try {
    const decoded = JSON.parse(decodeBase64Url(payload)) as { sub?: unknown }
    return typeof decoded.sub === "string" && UUID_RE.test(decoded.sub) ? decoded.sub : null
  } catch {
    return null
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

function invalid(message: string) {
  return Response.json({ message }, { status: 400, headers: { "Cache-Control": "no-store" } })
}

async function rpc(path: string, body: Record<string, unknown>) {
  return fetch(`${supabaseUrl}/rest/v1/rpc/${path}`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(body),
  })
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 })

  const actorUserId = actorFromAuthorization(request)
  if (!actorUserId) {
    return Response.json(
      { message: "authenticated_actor_required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  let body: CommandBody
  try {
    body = await request.json() as CommandBody
  } catch {
    return invalid("invalid_json")
  }

  try {
    let upstream: Response

    if (body.command === "assign") {
      if (
        !validUuid(body.workspace_id) ||
        !validUuid(body.intake_id) ||
        (body.assigned_to !== null && !validUuid(body.assigned_to)) ||
        !Number.isInteger(body.expected_version) ||
        body.expected_version < 1 ||
        typeof body.request_id !== "string" ||
        body.request_id.trim().length < 8 ||
        body.request_id.length > 200
      ) {
        return invalid("invalid_assignment")
      }

      upstream = await rpc("assign_intake_request_service", {
        p_workspace_id: body.workspace_id,
        p_intake_id: body.intake_id,
        p_assigned_to: body.assigned_to,
        p_expected_version: body.expected_version,
        p_actor_user_id: actorUserId,
        p_request_id: body.request_id,
      })
    } else if (body.command === "retry_notification") {
      if (
        !validUuid(body.workspace_id) ||
        !validUuid(body.delivery_id) ||
        typeof body.reason !== "string" ||
        body.reason.trim().length < 3 ||
        body.reason.length > 500
      ) {
        return invalid("invalid_notification_retry")
      }

      upstream = await rpc("request_notification_retry", {
        p_workspace_id: body.workspace_id,
        p_delivery_id: body.delivery_id,
        p_actor_user_id: actorUserId,
        p_reason: body.reason.trim(),
      })
    } else {
      return invalid("unsupported_command")
    }

    const responseBody = await upstream.text()
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return Response.json(
      { message: "operator_command_failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
})
