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

test("Resend adapter freezes payload and uses stable idempotency key", async () => {
  const { sendResendEmail } = await vite.ssrLoadModule("/lib/resend-adapter.ts")
  const previousKey = process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = "re_test_key"

  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return Response.json({ id: "email_123" })
  }

  try {
    const result = await sendResendEmail({
      recipient: "cliente@example.com",
      template_key: "crm-classy-intake-received",
      template_variables: {
        CUSTOMER_NAME: "Cliente",
        REFERENCE: "CLA-2026-000001",
      },
      from_snapshot: "CLASSY <atendimento@classyrp.com.br>",
      reply_to_snapshot: "contato@classyrp.com.br",
      delivery_key: "abc123",
    })

    assert.deepEqual(result, { kind: "accepted", providerMessageId: "email_123" })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://api.resend.com/emails")
    assert.equal(calls[0].init.headers["Idempotency-Key"], "crm/abc123")
    assert.equal(calls[0].init.headers.Authorization, "Bearer re_test_key")

    const body = JSON.parse(calls[0].init.body)
    assert.deepEqual(body.to, ["cliente@example.com"])
    assert.equal(body.from, "CLASSY <atendimento@classyrp.com.br>")
    assert.equal(body.reply_to, "contato@classyrp.com.br")
    assert.equal(body.template.id, "crm-classy-intake-received")
    assert.equal(body.template.variables.REFERENCE, "CLA-2026-000001")
  } finally {
    globalThis.fetch = originalFetch
    if (previousKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previousKey
  }
})

test("Resend adapter classifies provider failures conservatively", async () => {
  const { sendResendEmail } = await vite.ssrLoadModule("/lib/resend-adapter.ts")
  const previousKey = process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = "re_test_key"

  const originalFetch = globalThis.fetch
  const delivery = {
    recipient: "cliente@example.com",
    template_key: "crm-classy-intake-received",
    template_variables: { CUSTOMER_NAME: "Cliente", REFERENCE: "CLA-2026-000001" },
    from_snapshot: "CLASSY <atendimento@classyrp.com.br>",
    reply_to_snapshot: null,
    delivery_key: "abc123",
  }

  try {
    globalThis.fetch = async () =>
      Response.json({ name: "rate_limit_exceeded" }, { status: 429 })
    assert.deepEqual(await sendResendEmail(delivery), {
      kind: "rejected",
      failureKind: "transient",
      error: "rate_limit_exceeded",
    })

    globalThis.fetch = async () =>
      Response.json({ name: "validation_error" }, { status: 400 })
    assert.deepEqual(await sendResendEmail(delivery), {
      kind: "rejected",
      failureKind: "permanent",
      error: "validation_error",
    })

    globalThis.fetch = async () => Response.json({}, { status: 200 })
    assert.deepEqual(await sendResendEmail(delivery), {
      kind: "unknown",
      failureKind: "uncertain",
      error: "resend_accepted_without_message_id",
    })
  } finally {
    globalThis.fetch = originalFetch
    if (previousKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previousKey
  }
})

test("Svix verification accepts a valid raw-body signature and rejects replay timestamps", async () => {
  const { verifySvixWebhook } = await vite.ssrLoadModule("/lib/svix-webhook.ts")

  const keyBytes = Buffer.from("crm-core-webhook-test-key-32bytes!!")
  const secret = `whsec_${keyBytes.toString("base64")}`
  const id = "msg_test_123"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const rawBody = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: { email_id: "email_123" },
  })

  const signature = createHmac("sha256", keyBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64")

  assert.equal(
    await verifySvixWebhook(
      rawBody,
      { id, timestamp, signature: `v1,${signature}` },
      secret,
    ),
    true,
  )

  assert.equal(
    await verifySvixWebhook(
      rawBody,
      {
        id,
        timestamp: String(Number(timestamp) - 1000),
        signature: `v1,${signature}`,
      },
      secret,
    ),
    false,
  )

  assert.equal(
    await verifySvixWebhook(
      rawBody,
      { id, timestamp, signature: "v1,invalid" },
      secret,
    ),
    false,
  )
})
