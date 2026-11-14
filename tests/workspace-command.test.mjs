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

function setEnv() {
  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
}

function request(NextRequest, body, options = {}) {
  return new NextRequest(`${origin}/crm/api/workspaces`, {
    method: "POST",
    headers: {
      origin: options.origin ?? origin,
      "content-type": "application/json",
      cookie: options.cookie ?? "crm_access_token=user-access-token",
    },
    body: JSON.stringify(body),
  })
}

test("workspace creation uses the JWT-protected edge command without sending actor identity", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/workspaces/route.ts")
  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return Response.json("33333333-3333-4333-8333-333333333333")
  }

  try {
    const response = await POST(request(NextRequest, {
      name: "Workspace Seguro",
      slug: "workspace-seguro",
    }))

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.workspace.id, "33333333-3333-4333-8333-333333333333")
    assert.equal(body.workspace.role, "owner")

    assert.equal(calls.length, 1)
    assert.equal(
      calls[0].url,
      "https://supabase.example.invalid/functions/v1/crm-workspace-command",
    )
    assert.equal(calls[0].init.method, "POST")
    assert.equal(calls[0].init.headers.get("Authorization"), "Bearer user-access-token")
    assert.equal(calls[0].init.headers.get("apikey"), "sb_publishable_test")

    const forwarded = JSON.parse(calls[0].init.body)
    assert.deepEqual(forwarded, {
      command: "create_workspace",
      name: "Workspace Seguro",
      slug: "workspace-seguro",
    })
    assert.equal("actor_user_id" in forwarded, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("workspace creation preserves duplicate-slug and expired-session semantics", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/workspaces/route.ts")
  const originalFetch = globalThis.fetch

  try {
    globalThis.fetch = async () => Response.json(
      { code: "23505" },
      { status: 409 },
    )
    const duplicate = await POST(request(NextRequest, {
      name: "Duplicado",
      slug: "duplicado",
    }))
    assert.equal(duplicate.status, 409)
    assert.match((await duplicate.json()).message, /identificador/i)

    globalThis.fetch = async () => {
      throw new Error("fetch should not run without session")
    }
    const noSession = await POST(request(
      NextRequest,
      { name: "Sem sessão", slug: "sem-sessao" },
      { cookie: "" },
    ))
    assert.equal(noSession.status, 401)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("workspace creation rejects cross-origin mutation before external calls", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/workspaces/route.ts")
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    throw new Error("unexpected fetch")
  }

  try {
    const response = await POST(request(
      NextRequest,
      { name: "Workspace", slug: "workspace" },
      { origin: "https://evil.example" },
    ))
    assert.equal(response.status, 403)
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
