import assert from "node:assert/strict"
import test, { after } from "node:test"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const root = fileURLToPath(new URL("..", import.meta.url))
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
})
after(() => vite.close())

const origin = "https://crm.example.com"
const accessToken = "recovery-test-access-token-not-a-real-secret"

function setEnv() {
  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
}

function resetRequest(NextRequest, body, requestOrigin = origin) {
  return new NextRequest(`${origin}/crm/api/auth/reset-password`, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

test("password recovery rejects cross-origin and malformed requests before calling Auth", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/auth/reset-password/route.ts")
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error("unexpected fetch") }

  try {
    const crossOrigin = await POST(resetRequest(NextRequest, {
      access_token: accessToken,
      password: "correct-horse-battery",
    }, "https://elsewhere.example"))
    assert.equal(crossOrigin.status, 403)

    const malformed = await POST(resetRequest(NextRequest, {
      access_token: accessToken,
      password: "short",
    }))
    assert.equal(malformed.status, 400)
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("password recovery updates only the bearer user and clears old CRM cookies", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/auth/reset-password/route.ts")
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return Response.json({ id: "user-test" })
  }

  try {
    const response = await POST(resetRequest(NextRequest, {
      access_token: accessToken,
      password: "correct-horse-battery",
    }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.match(response.headers.get("set-cookie") ?? "", /crm_access_token=;/)
    assert.match(response.headers.get("set-cookie") ?? "", /Path=\/crm/i)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://supabase.example.invalid/auth/v1/user")
    assert.equal(calls[0].init.method, "PUT")
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${accessToken}`)
    assert.equal(calls[0].init.headers.apikey, "sb_publishable_test")
    assert.deepEqual(JSON.parse(calls[0].init.body), { password: "correct-horse-battery" })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("expired recovery token yields a safe message and no success", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/auth/reset-password/route.ts")
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ message: "provider details" }, { status: 401 })

  try {
    const response = await POST(resetRequest(NextRequest, {
      access_token: accessToken,
      password: "correct-horse-battery",
    }))
    assert.equal(response.status, 401)
    assert.doesNotMatch(JSON.stringify(await response.json()), /provider details/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
