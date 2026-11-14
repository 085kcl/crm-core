import { withCrmBasePath } from "@/lib/crm-base-path"

let activeRefresh: Promise<Response> | null = null

export function refreshSession() {
  if (!activeRefresh) {
    activeRefresh = fetch(withCrmBasePath("/api/auth/refresh"), { method: "POST" }).finally(() => {
      activeRefresh = null
    })
  }
  return activeRefresh
}

export async function fetchWithSessionRetry(input: RequestInfo | URL, init?: RequestInit) {
  const target = typeof input === "string" ? withCrmBasePath(input) : input
  let response = await fetch(target, init)
  if (response.status !== 401) return response

  const refresh = await refreshSession()
  if (!refresh.ok) return response

  response = await fetch(target, init)
  return response
}
