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
const statusId = "33333333-3333-4333-8333-333333333333"

test("status workflow read model stays user-scoped and exposes only safe notification policy", async () => {
  const { NextRequest } = await import("next/server.js")
  const { GET } = await vite.ssrLoadModule("/app/api/intakes/[intakeId]/status/route.ts")

  const previous = {
    url: process.env.SUPABASE_URL,
    publishable: process.env.SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.SUPABASE_SECRET_KEY,
  }
  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
  process.env.SUPABASE_SECRET_KEY = "sb_secret_server_policy"

  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, init })

    if (href.includes("/rest/v1/intake_requests?")) {
      return Response.json([{
        id: intakeId,
        public_reference: "CLA-2026-000001",
        customer_name: "Cliente Teste",
        customer_email: "cliente@example.com",
        customer_phone: null,
        source: "intake/pre_analysis",
        submitted_at: "2026-09-25T12:00:00.000Z",
        status_id: statusId,
        row_version: 2,
      }])
    }
    if (href.includes("/rest/v1/intake_statuses?")) {
      return Response.json([{
        id: statusId,
        key: "triage",
        label: "Em triagem",
        position: 10,
        is_initial: false,
        is_terminal: false,
        customer_notification_enabled: true,
        active: true,
        inbox_bucket: "in_progress",
      }])
    }
    if (href.includes("/rest/v1/intake_status_history?")) {
      return Response.json([{
        id: "44444444-4444-4444-8444-444444444444",
        from_status_id: null,
        to_status_id: statusId,
        from_status_key: null,
        from_status_label: null,
        to_status_key: "triage",
        to_status_label: "Em triagem",
        actor_user_id: null,
        actor_type: "integration",
        changed_at: "2026-09-25T12:00:00.000Z",
        comment: null,
        change_source: "intake.created",
        request_id: "initial-request",
        resulting_version: 1,
        customer_notification_enabled_snapshot: false,
      }])
    }
    if (href.includes("/rest/v1/notification_settings?")) {
      return Response.json([{ status_notifications_enabled: true }])
    }

    throw new Error(`unexpected fetch: ${href}`)
  }

  try {
    const request = new NextRequest(
      `https://crm.example.com/crm/api/intakes/${intakeId}/status`,
      {
        headers: {
          cookie: [
            "crm_access_token=user-jwt",
            `crm_workspace_id=${workspaceId}`,
          ].join("; "),
        },
      },
    )

    const response = await GET(request, { params: Promise.resolve({ intakeId }) })
    assert.equal(response.status, 200)

    const body = await response.json()
    assert.equal(body.intake.id, intakeId)
    assert.equal(body.intake.row_version, 2)
    assert.equal(body.statuses[0].label, "Em triagem")
    assert.equal(body.history.length, 1)
    assert.equal(body.status_notifications_enabled, true)

    assert.equal(calls.length, 4)

    const userCalls = calls.filter((call) =>
      call.href.includes("/intake_requests?") ||
      call.href.includes("/intake_statuses?") ||
      call.href.includes("/intake_status_history?"),
    )
    assert.equal(userCalls.length, 3)
    for (const call of userCalls) {
      assert.equal(call.init.headers.get("Authorization"), "Bearer user-jwt")
      assert.equal(call.init.headers.get("apikey"), "sb_publishable_test")
    }

    const policy = calls.find((call) =>
      call.href.includes("/rest/v1/notification_settings?"),
    )
    assert.ok(policy)
    assert.match(policy.href, new RegExp(`workspace_id=eq\\.${workspaceId}`))
    assert.match(policy.href, /select=status_notifications_enabled/)
    assert.equal(policy.init.headers.get("apikey"), "sb_secret_server_policy")
    assert.equal(policy.init.headers.get("Authorization"), null)
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

test("status workflow read model stops after an RLS-hidden intake", async () => {
  const { NextRequest } = await import("next/server.js")
  const { GET } = await vite.ssrLoadModule("/app/api/intakes/[intakeId]/status/route.ts")

  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"

  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ href: String(url), init })
    return Response.json([])
  }

  try {
    const request = new NextRequest(
      `https://crm.example.com/crm/api/intakes/${intakeId}/status`,
      {
        headers: {
          cookie: [
            "crm_access_token=user-jwt",
            `crm_workspace_id=${workspaceId}`,
          ].join("; "),
        },
      },
    )

    const response = await GET(request, { params: Promise.resolve({ intakeId }) })
    assert.equal(response.status, 404)
    assert.equal((await response.json()).code, "intake_not_found")
    assert.equal(calls.length, 1)
    assert.match(calls[0].href, /\/rest\/v1\/intake_requests\?/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
