const baseUrl = (process.argv[2] || "http://127.0.0.1:3100").replace(/\/$/, "")
const deadline = Date.now() + 60_000

async function requestFollowingInternalRedirects(path, maxRedirects = 8) {
  let current = new URL(path, baseUrl)
  const visited = []

  for (let index = 0; index <= maxRedirects; index += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(5000),
    })

    visited.push({
      url: current.toString(),
      status: response.status,
      location: response.headers.get("location"),
    })

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, visited }
    }

    const location = response.headers.get("location")
    if (!location) {
      throw new Error(`Redirect without Location: ${JSON.stringify(visited)}`)
    }

    const nextUrl = new URL(location, current)
    const expectedOrigin = new URL(baseUrl).origin
    if (nextUrl.origin !== expectedOrigin) {
      throw new Error(`Redirect escaped origin: ${JSON.stringify(visited)}`)
    }
    if (nextUrl.pathname !== "/crm" && !nextUrl.pathname.startsWith("/crm/")) {
      throw new Error(`Redirect escaped /crm: ${JSON.stringify(visited)}`)
    }
    if (visited.some((entry) => entry.url === nextUrl.toString())) {
      throw new Error(`Redirect loop detected: ${JSON.stringify([...visited, { next: nextUrl.toString() }])}`)
    }
    current = nextUrl
  }

  throw new Error(`Too many redirects: ${JSON.stringify(visited)}`)
}

async function waitFor(path) {
  let lastError = null
  while (Date.now() < deadline) {
    try {
      return await requestFollowingInternalRedirects(path)
    } catch (error) {
      lastError = error
      if (String(error).includes("Redirect loop detected") || String(error).includes("Redirect escaped")) {
        throw error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }
  throw lastError || new Error(`Timed out waiting for ${path}`)
}

const loginResult = await waitFor("/crm")
const login = loginResult.response
if (login.status !== 200) {
  throw new Error(`Expected /crm to resolve to 200, got ${login.status}: ${JSON.stringify(loginResult.visited)}`)
}
const contentType = login.headers.get("content-type") || ""
if (!contentType.toLowerCase().startsWith("text/html")) {
  throw new Error(`Expected HTML from /crm, got ${contentType || "no content-type"}`)
}
const loginHtml = await login.text()
if (!/CRM Core|Bem-vindo de volta|Acesso seguro/u.test(loginHtml)) {
  throw new Error("CRM login markers were not found in /crm response")
}

const recoveryResult = await waitFor("/crm/recuperar-senha")
if (recoveryResult.response.status !== 200) {
  throw new Error(`Expected recovery page to resolve to 200, got ${recoveryResult.response.status}: ${JSON.stringify(recoveryResult.visited)}`)
}

const recoveryHtml = await recoveryResult.response.text()
if (!/Recuperar|recupera|Redefinir/u.test(recoveryHtml)) {
  throw new Error("Recovery page markers were not found")
}

const assetPaths = [...new Set([...`${loginHtml} ${recoveryHtml}`.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1]).filter((path) => path.includes("/_next/static/")))]
if (!assetPaths.some((path) => path.endsWith(".js")) || !assetPaths.some((path) => path.endsWith(".css"))) {
  throw new Error("Expected generated JS and CSS assets")
}
for (const path of assetPaths) {
  if (!path.startsWith("/crm/_next/static/")) throw new Error(`Asset escaped /crm: ${path}`)
  const response = await fetch(new URL(path, baseUrl), { redirect: "error", signal: AbortSignal.timeout(5000) })
  if (response.status !== 200) throw new Error(`Asset ${path}: ${response.status}`)
  const type = response.headers.get("content-type") || ""
  if (path.endsWith(".js") && !/javascript/u.test(type)) throw new Error(`Invalid JS content type: ${type}`)
  if (path.endsWith(".css") && !type.startsWith("text/css")) throw new Error(`Invalid CSS content type: ${type}`)
  await response.arrayBuffer()
}

// No credentials, no DB access and no mutations: unauthenticated API must deny.
const api = await fetch(new URL("/crm/api/workspaces", baseUrl), {
  redirect: "error", signal: AbortSignal.timeout(5000),
})
if (api.status !== 401 || !(api.headers.get("content-type") || "").includes("application/json")) {
  throw new Error(`Expected JSON 401 from /crm/api/workspaces, got ${api.status}`)
}
if ((await api.json()).message !== "Sessão expirada.") throw new Error("Unexpected API contract")

console.log(JSON.stringify({
  ok: true,
  base_url: baseUrl,
  assets_verified: assetPaths.length,
  api_status: api.status,
  login_chain: loginResult.visited,
  recovery_chain: recoveryResult.visited,
}))

