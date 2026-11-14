import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/crm", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("serves tenant-scoped demo APIs for contacts, Contact 360 and search", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `api-${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
  const contactId = "31000000-0000-4000-8000-000000000001";
  const environment = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const cookie = `crm_demo_session=1; crm_workspace_id=${workspaceId}`;

  const listResponse = await worker.fetch(
    new Request("http://localhost/crm/api/contacts", { headers: { cookie } }),
    environment,
    context,
  );
  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json();
  assert.equal(listBody.mode, "demo");
  assert.equal(listBody.contacts[0].id, contactId);

  const detailResponse = await worker.fetch(
    new Request(`http://localhost/crm/api/contacts/${contactId}`, { headers: { cookie } }),
    environment,
    context,
  );
  assert.equal(detailResponse.status, 200);
  const detailBody = await detailResponse.json();
  assert.equal(detailBody.contact360.contact.first_name, "Mariana");
  assert.equal(detailBody.contact360.overdue_task_count, undefined);
  assert.equal(detailBody.contact360.contact.overdue_task_count, 1);

  const searchResponse = await worker.fetch(
    new Request("http://localhost/crm/api/search?q=atlas", { headers: { cookie } }),
    environment,
    context,
  );
  assert.equal(searchResponse.status, 200);
  const searchBody = await searchResponse.json();
  assert.ok(searchBody.results.some((item) => item.entity_type === "company"));

  const companyId = "51000000-0000-4000-8000-000000000001";
  const entityResponse = await worker.fetch(
    new Request(`http://localhost/crm/api/entities/company/${companyId}`, { headers: { cookie } }),
    environment,
    context,
  );
  assert.equal(entityResponse.status, 200);
  const entityBody = await entityResponse.json();
  assert.equal(entityBody.entity.entity_type, "company");
  assert.equal(entityBody.entity.title, "Grupo Atlas");

  const deniedEntityResponse = await worker.fetch(
    new Request(`http://localhost/crm/api/entities/company/${companyId}`, {
      headers: { cookie: `crm_demo_session=1; crm_workspace_id=${otherWorkspaceId}` },
    }),
    environment,
    context,
  );
  assert.equal(deniedEntityResponse.status, 404);
  assert.deepEqual(await deniedEntityResponse.json(), { message: "Registro não encontrado." });

  const deniedResponse = await worker.fetch(
    new Request(`http://localhost/crm/api/contacts/${contactId}`, {
      headers: { cookie: `crm_demo_session=1; crm_workspace_id=${otherWorkspaceId}` },
    }),
    environment,
    context,
  );
  assert.equal(deniedResponse.status, 404);
  assert.deepEqual(await deniedResponse.json(), { message: "Contato não encontrado." });
});
