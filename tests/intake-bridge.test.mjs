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

test("canonicalizes CLASSY intake bodies deterministically", async () => {
  const bridge = await vite.ssrLoadModule("/lib/intake-bridge.ts")
  const first = {
    customer_name: "João Teste",
    customer_email: "JOAO@example.com",
    schema_version: 1,
    payload: { z: 1, nested: { b: true, a: "x" }, a: [2, 1] },
  }
  const second = {
    payload: { a: [2, 1], nested: { a: "x", b: true }, z: 1 },
    schema_version: 1,
    customer_email: "JOAO@example.com",
    customer_name: "João Teste",
  }
  assert.equal(bridge.canonicalIntakeBody(first), bridge.canonicalIntakeBody(second))
  assert.equal(await bridge.sha256Hex("same"), await bridge.sha256Hex("same"))
  assert.notEqual(await bridge.sha256Hex("same"), await bridge.sha256Hex("different"))
})

test("bridge token comparison rejects malformed or incorrect credentials", async () => {
  const bridge = await vite.ssrLoadModule("/lib/intake-bridge.ts")
  assert.equal(await bridge.secureTokenMatches(null, "secret"), false)
  assert.equal(await bridge.secureTokenMatches("Basic secret", "secret"), false)
  assert.equal(await bridge.secureTokenMatches("Bearer wrong", "secret"), false)
  assert.equal(await bridge.secureTokenMatches("Bearer secret", "secret"), true)
})

test("CLASSY intake route is authenticated, idempotent-aware and never accepts tenant authority", async () => {
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/integrations/classy/intakes/route.ts")

  const originalFetch = globalThis.fetch
  const previous = {
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    bridge: process.env.CLASSY_BRIDGE_TOKEN,
    form: process.env.CLASSY_BRIDGE_FORM_KEY,
  }

  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_SECRET_KEY = "sb_secret_server-only-test-secret"
  process.env.CLASSY_BRIDGE_TOKEN = "bridge-test-secret"
  process.env.CLASSY_BRIDGE_FORM_KEY = "classy-pre-analysis"

  const calls = []
  let created = true
  let failure = null

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (failure) {
      return Response.json({ message: failure }, { status: 400 })
    }
    return Response.json([
      {
        created,
        public_reference: "CLA-2026-000001",
        received_at: "2026-09-24T21:45:00.000Z",
        contact_match_state: "new",
        lead_link_state: "created",
      },
    ])
  }

  const body = {
    external_id: "classy-pre-123",
    schema_version: 1,
    customer_name: "Cliente Teste",
    customer_email: "cliente@example.com",
    customer_phone: "+55 16 99999-9999",
    payload: { renda_mensal: 7000, valor_imovel: 350000 },
  }

  const makeRequest = (overrides = {}) =>
    new NextRequest("https://crm.example.com/crm/api/integrations/classy/intakes", {
      method: "POST",
      headers: {
        authorization: "Bearer bridge-test-secret",
        "idempotency-key": "550e8400-e29b-41d4-a716-446655440000",
        "content-type": "application/json",
        ...overrides,
      },
      body: JSON.stringify(body),
    })

  try {
    const unauthorized = await POST(
      new NextRequest("https://crm.example.com/crm/api/integrations/classy/intakes", {
        method: "POST",
        headers: {
          "idempotency-key": "550e8400-e29b-41d4-a716-446655440000",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    )
    assert.equal(unauthorized.status, 401)
    assert.equal(calls.length, 0)

    const forbiddenAuthority = await POST(
      new NextRequest("https://crm.example.com/crm/api/integrations/classy/intakes", {
        method: "POST",
        headers: {
          authorization: "Bearer bridge-test-secret",
          "idempotency-key": "550e8400-e29b-41d4-a716-446655440001",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...body, workspace_id: "11111111-1111-4111-8111-111111111111" }),
      }),
    )
    assert.equal(forbiddenAuthority.status, 422)
    assert.equal(calls.length, 0)

    const createdResponse = await POST(makeRequest())
    assert.equal(createdResponse.status, 201)
    const createdBody = await createdResponse.json()
    assert.equal(createdBody.public_reference, "CLA-2026-000001")
    assert.equal(createdBody.receipt_state, "registered")
    assert.equal(createdBody.communication_state, "queued")
    assert.equal(createdBody.replay, false)

    const rpcCall = calls.at(-1)
    assert.match(rpcCall.url, /\/rest\/v1\/rpc\/submit_intake_bridge$/)
    assert.equal(rpcCall.init.headers.get("apikey"), "sb_secret_server-only-test-secret")
    assert.equal(rpcCall.init.headers.get("Authorization"), null)
    const rpcBody = JSON.parse(rpcCall.init.body)
    assert.equal(rpcBody.p_form_key, "classy-pre-analysis")
    assert.equal(rpcBody.p_external_source_system, "classy_admin")
    assert.equal(rpcBody.p_external_entity_type, "pre_analysis")
    assert.equal(rpcBody.p_external_id, "classy-pre-123")
    assert.equal("workspace_id" in rpcBody, false)
    assert.match(rpcBody.p_idempotency_key_hash, /^[a-f0-9]{64}$/)
    assert.match(rpcBody.p_request_hash, /^[a-f0-9]{64}$/)

    created = false
    const replayResponse = await POST(makeRequest())
    assert.equal(replayResponse.status, 200)
    assert.equal((await replayResponse.json()).replay, true)

    failure = "intake_idempotency_conflict"
    const conflictResponse = await POST(makeRequest())
    assert.equal(conflictResponse.status, 409)
    assert.equal((await conflictResponse.json()).code, "idempotency_conflict")
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      const envKey = {
        url: "SUPABASE_URL",
        secret: "SUPABASE_SECRET_KEY",
        bridge: "CLASSY_BRIDGE_TOKEN",
        form: "CLASSY_BRIDGE_FORM_KEY",
      }[key]
      if (value === undefined) delete process.env[envKey]
      else process.env[envKey] = value
    }
  }
})
