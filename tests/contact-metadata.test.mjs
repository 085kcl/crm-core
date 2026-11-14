import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(() => vite.close());
const { validFieldValue, metadataMutation } = await vite.ssrLoadModule("/lib/custom-fields.ts");

test("validates all 13 custom field types and rejects incompatible JSON", () => {
  const cases = [
    ["text", "Texto", 3], ["textarea", "Linha\nOutra", false],
    ["integer", 42, 1.5], ["decimal", 1.5, "1.5"], ["currency", 99.90, Infinity],
    ["boolean", false, "false"], ["date", "2026-09-09", "2026-02-30"],
    ["datetime", "2026-09-09T12:30:00Z", "ontem"],
    ["select", "A", "B"], ["multiselect", ["A"], ["B"]],
    ["email", "test@example.invalid", "email"], ["phone", "+5511999999999", 123],
    ["url", "https://example.com", "javascript:alert(1)"],
  ];
  for (const [field_type, good, bad] of cases) {
    const field = { field_type, options: ["A"], is_required: true };
    assert.equal(validFieldValue(field, good), true, `${field_type} valid`);
    assert.equal(validFieldValue(field, bad), false, `${field_type} invalid`);
    assert.equal(validFieldValue(field, null), false);
  }
  assert.equal(validFieldValue({ field_type: "integer", options: [], is_required: true }, 0), true);
  assert.equal(validFieldValue({ field_type: "multiselect", options: [], is_required: true }, []), false);
  assert.equal(validFieldValue({ field_type: "multiselect", options: [], is_required: false }, [2]), false);
});

test("does not accept caller-supplied tenant or creator fields", () => {
  assert.equal(metadataMutation.safeParse({ action: "create_tag", name: "VIP", slug: "vip" }).success, true);
  for (const key of ["workspace_id", "created_by", "entity_id"]) {
    assert.equal(metadataMutation.safeParse({ action: "create_tag", name: "VIP", slug: "vip", [key]: "external" }).success, false);
  }
  assert.equal(metadataMutation.safeParse({ action: "save_field", definition_id: "31000000-0000-4000-8000-000000000001", value: null }).success, false);
});

test("metadata API enforces origin, session, tenant scope and database validation", async () => {
  const { NextRequest } = await import("next/server.js");
  const { POST } = await vite.ssrLoadModule("/app/api/contacts/[contactId]/metadata/route.ts");
  const workspace = "11111111-1111-4111-8111-111111111111";
  const contact = "31000000-0000-4000-8000-000000000001";
  const definition = "41000000-0000-4000-8000-000000000001";
  const context = { params: Promise.resolve({ contactId: contact }) };
  const calls = [];
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = "https://supabase.example.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  let visible = true;
  let writeStatus = 201;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/contacts?")) return Response.json(visible ? [{ id: contact }] : []);
    if (String(url).includes("/custom_field_definitions?")) return Response.json([{ field_type: "integer", options: [], is_required: true }]);
    return Response.json(writeStatus === 201 ? [{ id: definition }] : { message: "private database detail" }, { status: writeStatus });
  };
  const request = (body, cookie = `crm_access_token=test-token; crm_workspace_id=${workspace}`, origin = "http://localhost") => new NextRequest(`http://localhost/crm/api/contacts/${contact}/metadata`, { method: "POST", headers: { origin, cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const data = { action: "save_field", definition_id: definition, value: 42 };
    assert.equal((await POST(request(data, undefined, "https://external.invalid"), context)).status, 403);
    assert.equal(calls.length, 0);
    assert.equal((await POST(request(data, `crm_workspace_id=${workspace}`), context)).status, 401);
    assert.equal((await POST(request(data, `crm_demo_session=1; crm_workspace_id=${workspace}`), context)).status, 403);
    assert.equal((await POST(request({ ...data, value: 1.2 }), context)).status, 400);
    assert.equal(calls.some((call) => call.url.includes("/custom_field_values")), false);
    assert.equal((await POST(request(data), context)).status, 200);
    const write = calls.at(-1);
    assert.equal(write.init.headers.get("Authorization"), "Bearer test-token");
    assert.deepEqual(JSON.parse(write.init.body), { workspace_id: workspace, entity_type: "contact", entity_id: contact, definition_id: definition, value: 42 });
    writeStatus = 403;
    const denied = await POST(request(data), context);
    assert.equal(denied.status, 403);
    assert.doesNotMatch(await denied.text(), /private database detail/);
    visible = false;
    const before = calls.length;
    assert.equal((await POST(request(data), context)).status, 404);
    assert.equal(calls.length, before + 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
