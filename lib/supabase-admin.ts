type SupabaseAdminConfig = {
  url: string
  secretKey: string
}

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "")
}

export function getSupabaseAdminConfig(): SupabaseAdminConfig | null {
  const rawUrl = process.env.SUPABASE_URL?.trim()
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!rawUrl || !secretKey) return null

  try {
    const parsed = new URL(rawUrl)
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
    if (parsed.protocol !== "https:" && !isLocal) return null
  } catch {
    return null
  }

  return { url: cleanBaseUrl(rawUrl), secretKey }
}

export async function supabaseAdminRequest(path: string, init: RequestInit = {}) {
  const config = getSupabaseAdminConfig()
  if (!config) throw new Error("supabase_admin_not_configured")

  const headers = new Headers(init.headers)
  headers.set("apikey", config.secretKey)
  // New sb_secret_* keys are API keys, not JWTs. Legacy service_role keys
  // remain JWTs and may also be sent as Authorization during migration.
  if (!config.secretKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${config.secretKey}`)
  } else {
    headers.delete("Authorization")
  }
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json")
  }

  return fetch(`${config.url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  })
}
