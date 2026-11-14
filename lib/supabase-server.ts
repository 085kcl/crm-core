type SupabaseConfig = {
  url: string
  publishableKey: string
}

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "")
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const rawUrl = process.env.SUPABASE_URL?.trim()
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim()

  if (!rawUrl || !publishableKey) return null

  try {
    const parsed = new URL(rawUrl)
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
    if (parsed.protocol !== "https:" && !isLocal) return null
  } catch {
    return null
  }

  return { url: cleanBaseUrl(rawUrl), publishableKey }
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null
}

export async function supabaseRequest(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
) {
  const config = getSupabaseConfig()
  if (!config) throw new Error("supabase_not_configured")

  const headers = new Headers(init.headers)
  headers.set("apikey", config.publishableKey)
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json")
  }

  return fetch(`${config.url}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  })
}
