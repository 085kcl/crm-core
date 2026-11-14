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

const workspaceId = "11111111-1111-4111-8111-111111111111"
const intakeId = "22222222-2222-4222-8222-222222222222"
const targetStatusId = "33333333-3333-4333-8333-333333333333"
const actorId = "44444444-4444-4444-8444-444444444444"

test("status transition API derives tenant and actor from trusted session context", async () => {
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/intakes/[intakeId]/status/route.ts")

  const previous = {
    url: process.env.SUPABASE_URL,
    publishable: process.env.SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.SUPABASE_SECRET_KEY,
  }
  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test"

  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, init })

    if (href.includes("/rest/v1/intake_requests?")) {
      return Response.json([{ id: intakeId, row_version: 1, status_id: "55555555-5555-4555-8555-555555555555" }])
    }
    if (href.endsWith("/auth/v1/user")) {
      return Response.json({ id: actorId })
    }
    if (href.endsWith("/rest/v1/rpc/transition_intake_status_service")) {
      return Response.json([{
        changed: true,
        replayed: false,
        row_version: 2,
        history_id: "66666666-6666-4666-8666-666666666666",
        status_id: targetStatusId,
        status_key: "triage",
        status_label: "Em triagem",
        customer_notification_enabled: false,
      }])
    }
    throw new Error(`unexpected fetch: ${href}`)
  }

  try {
    const request = new NextRequest(
      `https://crm.example.com/crm/api/intakes/${intakeId}/status`,
      {
        method: "POST",
        headers: {
          origin: "https://crm.example.com",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          cookie: [
            "crm_access_token=user-jwt",
            `crm_workspace_id=${workspaceId}`,
          ].join("; "),
        },
        body: JSON.stringify({
          target_status_id: targetStatusId,
          expected_version: 1,
          request_id: "request-status-0001",
          comment: "Comentário interno.",
        }),
      },
    )

    const response = await POST(request, {
      params: Promise.resolve({ intakeId }),
    })

    assert.equal(response.status, 200)
    const responseBody = await response.json()
    assert.equal(responseBody.changed, true)
    assert.equal(responseBody.row_version, 2)
    assert.equal(responseBody.status.id, targetStatusId)

    const lookup = calls.find((call) => call.href.includes("/rest/v1/intake_requests?"))
    assert.ok(lookup)
    assert.match(lookup.href, new RegExp(`workspace_id=eq\\.${workspaceId}`))
    assert.equal(lookup.init.headers.get("Authorization"), "Bearer user-jwt")

    const auth = calls.find((call) => call.href.endsWith("/auth/v1/user"))
    assert.ok(auth)
    assert.equal(auth.init.headers.get("Authorization"), "Bearer user-jwt")

    const rpc = calls.find((call) =>
      call.href.endsWith("/rest/v1/rpc/transition_intake_status_service"),
    )
    assert.ok(rpc)
    assert.equal(rpc.init.headers.get("apikey"), "sb_secret_test")
    assert.equal(rpc.init.headers.get("Authorization"), null)

    const rpcBody = JSON.parse(rpc.init.body)
    assert.equal(rpcBody.p_workspace_id, workspaceId)
    assert.equal(rpcBody.p_intake_id, intakeId)
    assert.equal(rpcBody.p_actor_user_id, actorId)
    assert.equal(rpcBody.p_target_status_id, targetStatusId)
    assert.equal(rpcBody.p_expected_version, 1)
    assert.equal(rpcBody.p_change_source, "ui")
  } finally {
    globalThis.fetch = originalFetch
    if (previous.url === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previous.url
    if (previous.publishable === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY
    else process.env.SUPABASE_PUBLISHABLE_KEY = previous.publishable
    if (previous.secret === undefined) delete process.env.SUPABASE_SECRET_KEY
    else process.env.SUPABASE_SECRET_KEY = previous.secret
  }
})

test("status transition API maps optimistic concurrency conflicts to 409", async () => {
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/intakes/[intakeId]/status/route.ts")

  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test"

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.includes("/rest/v1/intake_requests?")) {
      return Response.json([{ id: intakeId, row_version: 2, status_id: "55555555-5555-4555-8555-555555555555" }])
    }
    if (href.endsWith("/auth/v1/user")) return Response.json({ id: actorId })
    if (href.endsWith("/rest/v1/rpc/transition_intake_status_service")) {
      return Response.json(
        { message: "intake_version_conflict" },
        { status: 400 },
      )
    }
    throw new Error(`unexpected fetch: ${href}`)
  }

  try {
    const request = new NextRequest(
      `https://crm.example.com/crm/api/intakes/${intakeId}/status`,
      {
        method: "POST",
        headers: {
          origin: "https://crm.example.com",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          cookie: [
            "crm_access_token=user-jwt",
            `crm_workspace_id=${workspaceId}`,
          ].join("; "),
        },
        body: JSON.stringify({
          target_status_id: targetStatusId,
          expected_version: 1,
          request_id: "request-status-stale",
        }),
      },
    )

    const response = await POST(request, {
      params: Promise.resolve({ intakeId }),
    })
    assert.equal(response.status, 409)
    assert.equal((await response.json()).code, "status_conflict")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("status transition API rejects cross-site mutations before any backend call", async () => {
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/intakes/[intakeId]/status/route.ts")

  const originalFetch = globalThis.fetch
  let called = false
  globalThis.fetch = async () => {
    called = true
    throw new Error("backend should not be called")
  }

  try {
    const request = new NextRequest(
      `https://crm.example.com/crm/api/intakes/${intakeId}/status`,
      {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
          "content-type": "application/json",
          cookie: [
            "crm_access_token=user-jwt",
            `crm_workspace_id=${workspaceId}`,
          ].join("; "),
        },
        body: JSON.stringify({
          target_status_id: targetStatusId,
          expected_version: 1,
          request_id: "request-cross-site",
        }),
      },
    )

    const response = await POST(request, {
      params: Promise.resolve({ intakeId }),
    })
    assert.equal(response.status, 403)
    assert.equal(called, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
