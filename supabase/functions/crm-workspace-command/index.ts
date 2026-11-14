export {}

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

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

  let body: { command?: unknown; name?: unknown; slug?: unknown }
  try {
    body = await request.json()
  } catch {
    return invalid("invalid_json")
  }

  if (body.command !== "create_workspace") return invalid("unsupported_command")

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : ""

  if (
    name.length < 2 ||
    name.length > 120 ||
    slug.length < 3 ||
    slug.length > 64 ||
    !SLUG_RE.test(slug)
  ) {
    return invalid("invalid_workspace")
  }

  try {
    const upstream = await rpc("create_workspace_service", {
      p_name: name,
      p_slug: slug,
      p_actor_user_id: actorUserId,
    })

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
      { message: "workspace_command_failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
})
