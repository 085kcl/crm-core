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
const userId = "44444444-4444-4444-8444-444444444444"
const deliveryId = "55555555-5555-4555-8555-555555555555"

function setEnv() {
  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
  delete process.env.SUPABASE_SECRET_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
}

test("intake inbox is paginated server-side and keeps communication failure separate", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { GET } = await vite.ssrLoadModule("/app/api/intakes/route.ts")
  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, init })

    if (href.endsWith("/auth/v1/user")) return Response.json({ id: userId })
    if (href.includes("/rest/v1/workspace_members?")) {
      return Response.json([{ role: "owner", status: "active" }])
    }
    if (href.includes("/rest/v1/intake_statuses?")) {
      return Response.json([{
        id: statusId,
        key: "received",
        label: "Recebida",
        inbox_bucket: "new",
        is_terminal: false,
        active: true,
      }])
    }
    if (href.includes("/rest/v1/intake_requests?")) {
      return Response.json([{
        id: intakeId,
        public_reference: "CLA-2026-000004",
        form_type: "pre_analysis",
        source: "intake/pre_analysis",
        contact_id: null,
        lead_id: null,
        status_id: statusId,
        customer_name: "Cliente Teste",
        customer_email: "cliente@example.com",
        customer_phone: null,
        assigned_to: null,
        submitted_at: "2026-09-27T19:52:19.000Z",
        updated_at: "2026-09-27T19:52:19.000Z",
        row_version: 1,
        contact_match_state: "needs_review",
        lead_link_state: "pending_review",
      }], {
        headers: { "content-range": "0-0/1" },
      })
    }
    if (href.includes("/rest/v1/notification_deliveries?")) {
      return Response.json([{
        intake_request_id: intakeId,
        status: "failed",
        reconciliation_required: false,
      }])
    }
    throw new Error(`unexpected fetch: ${href}`)
  }

  try {
    const request = new NextRequest(
      "https://crm.example.com/crm/api/intakes?bucket=new&assignee=all&needs_review=1&page=1&limit=25",
      {
        headers: {
          cookie: `crm_access_token=user-jwt; crm_workspace_id=${workspaceId}`,
        },
      },
    )
    const response = await GET(request)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.total, 1)
    assert.equal(body.items.length, 1)
    assert.equal(body.items[0].public_reference, "CLA-2026-000004")
    assert.equal(body.items[0].needs_review, true)
    assert.equal(body.items[0].communication_state, "failed")
    assert.equal(body.items[0].status.inbox_bucket, "new")

    const intakeCall = calls.find((call) => call.href.includes("/rest/v1/intake_requests?"))
    assert.ok(intakeCall)
    assert.equal(intakeCall.init.headers.get("Range"), "0-24")
    assert.equal(intakeCall.init.headers.get("Prefer"), "count=exact")
    assert.match(intakeCall.href, /workspace_id=eq./)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("viewer communication response masks recipient and technical provider details", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { GET } = await vite.ssrLoadModule("/app/api/intakes/[intakeId]/communications/route.ts")
  const originalFetch = globalThis.fetch
  let attemptsRequested = false

  globalThis.fetch = async (url) => {
    const href = String(url)
    if (href.endsWith("/auth/v1/user")) return Response.json({ id: userId })
    if (href.includes("/rest/v1/workspace_members?")) {
      return Response.json([{ role: "viewer", status: "active" }])
    }
    if (href.includes("/rest/v1/intake_requests?")) return Response.json([{ id: intakeId }])
    if (href.includes("/rest/v1/notification_deliveries?")) {
      return Response.json([{
        id: deliveryId,
        event_type: "intake.created",
        intent_key: "company_internal",
        recipient: "classycorrespondente@gmail.com",
        template_key: "crm-classy-intake-internal",
        provider: "resend",
        status: "delivered",
        attempt_count: 1,
        last_error: null,
        queued_at: "2026-09-27T19:52:20.000Z",
        sent_at: "2026-09-27T19:52:21.000Z",
        delivered_at: "2026-09-27T19:53:03.000Z",
        failed_at: null,
        failure_kind: null,
        retryable: false,
        reconciliation_required: false,
      }])
    }
    if (href.includes("/rest/v1/notification_delivery_attempts?")) {
      attemptsRequested = true
      return Response.json([])
    }
    throw new Error(`unexpected fetch: ${href}`)
  }

  try {
    const request = new NextRequest(
      `https://crm.example.com/crm/api/intakes/${intakeId}/communications`,
      {
        headers: {
          cookie: `crm_access_token=user-jwt; crm_workspace_id=${workspaceId}`,
        },
      },
    )
    const response = await GET(request, { params: Promise.resolve({ intakeId }) })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.role, "viewer")
    assert.equal(body.can_retry, false)
    assert.equal(body.deliveries[0].recipient, null)
    assert.equal(body.deliveries[0].provider, null)
    assert.equal(body.deliveries[0].last_error, null)
    assert.deepEqual(body.deliveries[0].attempts, [])
    assert.equal(attemptsRequested, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("assignment route uses the JWT-protected edge command without a service secret", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/intakes/[intakeId]/assignment/route.ts")
  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, init })
    if (href.endsWith("/auth/v1/user")) return Response.json({ id: userId })
    if (href.includes("/rest/v1/workspace_members?")) {
      return Response.json([{ role: "manager", status: "active" }])
    }
    if (href.includes("/rest/v1/intake_requests?")) {
      return Response.json([{ id: intakeId, row_version: 3, assigned_to: null }])
    }
    if (href.endsWith("/functions/v1/crm-intake-operator-command")) {
      const body = JSON.parse(init.body)
      if (body.command === "assign") {
        return Response.json([{ changed: true, row_version: 4, assigned_to: userId }])
      }
    }
    throw new Error(`unexpected fetch: ${href}`)
  }

  try {
    const request = new NextRequest(
      `https://crm.example.com/crm/api/intakes/${intakeId}/assignment`,
      {
        method: "POST",
        headers: {
          origin: "https://crm.example.com",
          "content-type": "application/json",
          cookie: `crm_access_token=user-jwt; crm_workspace_id=${workspaceId}`,
        },
        body: JSON.stringify({
          assigned_to: userId,
          expected_version: 3,
          request_id: "assignment-test-0001",
        }),
      },
    )
    const response = await POST(request, { params: Promise.resolve({ intakeId }) })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.changed, true)
    assert.equal(body.row_version, 4)

    const rpc = calls.find((call) => {
      if (!call.href.endsWith("/functions/v1/crm-intake-operator-command")) return false
      const body = JSON.parse(call.init.body)
      return body.command === "assign"
    })
    assert.ok(rpc)
    assert.equal(rpc.init.headers.get("apikey"), "sb_publishable_test")
    assert.equal(rpc.init.headers.get("Authorization"), "Bearer user-jwt")
    const rpcBody = JSON.parse(rpc.init.body)
    assert.equal(rpcBody.p_actor_user_id, undefined)
    assert.equal(rpcBody.workspace_id, workspaceId)
    assert.equal(rpcBody.intake_id, intakeId)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("notification retry route uses the JWT-protected edge command without a service secret", async () => {
  setEnv()
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/notification-deliveries/[deliveryId]/retry/route.ts")
  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, init })
    if (href.includes("/rest/v1/notification_deliveries?")) {
      return Response.json([{
        id: deliveryId,
        status: "failed",
        reconciliation_required: false,
      }])
    }
    if (href.endsWith("/functions/v1/crm-intake-operator-command")) {
      const body = JSON.parse(init.body)
      if (body.command === "retry_notification") {
        return Response.json("retry_scheduled")
      }
    }
    throw new Error(`unexpected fetch: ${href}`)
  }

  try {
    const request = new NextRequest(
      `https://crm.example.com/crm/api/notification-deliveries/${deliveryId}/retry`,
      {
        method: "POST",
        headers: {
          origin: "https://crm.example.com",
          "content-type": "application/json",
          cookie: `crm_access_token=user-jwt; crm_workspace_id=${workspaceId}`,
        },
        body: JSON.stringify({ reason: "Retry controlado pelo operador" }),
      },
    )

    const response = await POST(request, { params: Promise.resolve({ deliveryId }) })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { scheduled: true })

    const rpc = calls.find((call) => {
      if (!call.href.endsWith("/functions/v1/crm-intake-operator-command")) return false
      const body = JSON.parse(call.init.body)
      return body.command === "retry_notification"
    })
    assert.ok(rpc)
    assert.equal(rpc.init.headers.get("apikey"), "sb_publishable_test")
    assert.equal(rpc.init.headers.get("Authorization"), "Bearer user-jwt")
    const rpcBody = JSON.parse(rpc.init.body)
    assert.equal(rpcBody.p_actor_user_id, undefined)
    assert.equal(rpcBody.workspace_id, workspaceId)
    assert.equal(rpcBody.delivery_id, deliveryId)
  } finally {
    globalThis.fetch = originalFetch
  }
})
