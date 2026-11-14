import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
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

const sampleInstagram = {
  object: "instagram",
  entry: [
    { id: "178000000001", time: 1794660000,
      changes: [{ field: "comments", value: { id: "comment_123", text: "CRÉDITO" } }] },
  ],
}

test("Meta canonical extraction is stable and never accepts tenant IDs as routing authority", async () => {
  const helpers = await vite.ssrLoadModule("/lib/classy-connect/meta-webhook.ts")
  const first = await helpers.prepareMetaWebhookEvents(sampleInstagram)
  const second = await helpers.prepareMetaWebhookEvents({
    entry: [{ changes: sampleInstagram.entry[0].changes, time: 1794660000, id: "178000000001" }],
    object: "instagram",
  })
  assert.equal(first.length, 1)
  assert.equal(first[0].provider, "instagram")
  assert.equal(first[0].external_account_id, "178000000001")
  assert.equal(first[0].event_hash, second[0].event_hash)
  assert.match(first[0].event_hash, /^[0-9a-f]{64}$/)
  assert.equal("workspace_id" in first[0], false)

  const whatsapp = await helpers.prepareMetaWebhookEvents({
    object: "whatsapp_business_account",
    entry: [{ id: "waba_abc", changes: [
      { field: "messages", value: {
        metadata: { phone_number_id: "1133557799" },
        messages: [{ id: "wamid.test" }],
      } },
    ] }],
  })
  assert.equal(whatsapp.length, 1)
  assert.equal(whatsapp[0].provider, "whatsapp")
  assert.equal(whatsapp[0].external_account_id, "1133557799")
  assert.equal(await helpers.prepareMetaWebhookEvents({ object: "unknown", entry: [] }), null)
})

test("Meta GET handshake requires configured verification token", async () => {
  const { NextRequest } = await import("next/server.js")
  const { GET } = await vite.ssrLoadModule("/app/api/integrations/meta/webhook/route.ts")
  const previous = process.env.META_WEBHOOK_VERIFY_TOKEN
  process.env.META_WEBHOOK_VERIFY_TOKEN = "configured-test-token"
  try {
    const valid = await GET(new NextRequest(
      "https://crm.example.invalid/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=configured-test-token&hub.challenge=2468",
    ))
    assert.equal(valid.status, 200)
    assert.equal(await valid.text(), "2468")

    const invalid = await GET(new NextRequest(
      "https://crm.example.invalid/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=2468",
    ))
    assert.equal(invalid.status, 403)
  } finally {
    if (previous === undefined) delete process.env.META_WEBHOOK_VERIFY_TOKEN
    else process.env.META_WEBHOOK_VERIFY_TOKEN = previous
  }
})

test("Meta POST rejects bad signatures; verified events persist with server-side tenant resolution", async () => {
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/integrations/meta/webhook/route.ts")
  const originalFetch = globalThis.fetch
  const previous = {
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  }
  process.env.META_APP_SECRET = "app-secret-for-testing-only"
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test-token"
  process.env.SUPABASE_URL = "https://supabase.example.invalid"
  process.env.SUPABASE_SECRET_KEY = "sb_secret_testing-only"
  const calls = []
  let mockFailure = false
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return mockFailure ? Response.json({ error: "unavailable" }, { status: 503 })
      : Response.json(1)
  }
  const raw = JSON.stringify(sampleInstagram)
  const signature = `sha256=${createHmac("sha256", process.env.META_APP_SECRET)
    .update(raw).digest("hex")}`
  const request = (body, header = signature) => new NextRequest(
    "https://crm.example.invalid/api/integrations/meta/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": header },
      body,
    },
  )
  try {
    assert.equal((await POST(request(raw, "sha256=" + "0".repeat(64)))).status, 401)
    assert.equal((await POST(request(raw + " "))).status, 401)
    assert.equal(calls.length, 0)

    const good = await POST(request(raw))
    assert.equal(good.status, 200)
    assert.equal(await good.text(), "EVENT_RECEIVED")
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/ingest_connect_webhook_events$/)
    const sent = JSON.parse(calls[0].options.body)
    assert.equal("workspace_id" in sent, false)
    assert.equal(sent.p_events.length, 1)
    assert.equal(sent.p_events[0].provider, "instagram")
    assert.equal(sent.p_events[0].external_account_id, "178000000001")
    assert.equal("workspace_id" in sent.p_events[0], false)

    mockFailure = true
    assert.equal((await POST(request(raw))).status, 503)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("Meta ingress caps streamed bodies even when Content-Length is forged", async () => {
  const { NextRequest } = await import("next/server.js")
  const { POST } = await vite.ssrLoadModule("/app/api/integrations/meta/webhook/route.ts")
  const priorSecret = process.env.META_APP_SECRET
  const priorToken = process.env.META_WEBHOOK_VERIFY_TOKEN
  const oldFetch = globalThis.fetch
  process.env.META_APP_SECRET = "meta-secret-unit-test"
  process.env.META_WEBHOOK_VERIFY_TOKEN = "meta-verify-unit-test"
  let networkCalls = 0
  globalThis.fetch = async () => {networkCalls++;return Response.json({})}
  try {
    const hugeBody = JSON.stringify({object:"instagram",entry:[],padding:"x".repeat(280000)})
    const response = await POST(new NextRequest(
      "https://crm.example.invalid/api/integrations/meta/webhook", {
        method:"POST",
        headers:{
          "content-type":"application/json",
          "content-length":"1",
          "x-hub-signature-256":"sha256="+"0".repeat(64),
        },
        body:hugeBody,
      },
    ))
    assert.equal(response.status,413)
    assert.equal((await response.json()).code,"payload_too_large")
    assert.equal(networkCalls,0)
  } finally {
    globalThis.fetch=oldFetch
    if(priorSecret===undefined)delete process.env.META_APP_SECRET
    else process.env.META_APP_SECRET=priorSecret
    if(priorToken===undefined)delete process.env.META_WEBHOOK_VERIFY_TOKEN
    else process.env.META_WEBHOOK_VERIFY_TOKEN=priorToken
  }
})
