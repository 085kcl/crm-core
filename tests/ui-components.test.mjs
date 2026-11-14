import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("keeps Contact 360 helpers deterministic and tenant-scoped", async () => {
  const types = await vite.ssrLoadModule("/lib/crm-v003-types.ts");
  const demo = await vite.ssrLoadModule("/lib/crm-v003-demo.ts");
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
  const contact = demo.demoContacts(workspaceId)[0];

  assert.equal(types.contactDisplayName(contact), "Mariana Costa");
  assert.equal(types.contactInitials(contact), "MC");
  assert.equal(
    types.crmEntityHref({ entity_type: "contact", entity_id: contact.id }),
    `/app/contatos/${contact.id}`,
  );
  assert.equal(
    types.crmEntityHref({ entity_type: "company", entity_id: contact.id }),
    `/app/entidades/company/${contact.id}`,
  );
  assert.equal(
    types.crmEntityHref({ entity_type: "lead", entity_id: contact.id }),
    `/app/entidades/lead/${contact.id}`,
  );
  assert.equal(
    types.crmEntityHref({ entity_type: "deal", entity_id: contact.id }),
    `/app/entidades/deal/${contact.id}`,
  );
  assert.equal(demo.demoContact360(otherWorkspaceId, contact.id), null);
  assert.equal(
    demo.demoEntityPreview(workspaceId, "company", "51000000-0000-4000-8000-000000000001")?.title,
    "Grupo Atlas",
  );
  assert.equal(
    demo.demoEntityPreview(otherWorkspaceId, "company", "51000000-0000-4000-8000-000000000001"),
    null,
  );
  assert.deepEqual(demo.demoSearch(workspaceId, "m"), []);
  assert.ok(demo.demoSearch(workspaceId, "mariana").some((item) => item.entity_type === "contact"));
  assert.ok(demo.demoSearch(workspaceId, "atlas").some((item) => item.entity_type === "company"));
  assert.ok(demo.demoSearch(workspaceId, "diagnóstico").some((item) => item.entity_type === "deal"));
});

test("detects overdue tasks without treating completed work as overdue", async () => {
  const { isTaskOverdue } = await vite.ssrLoadModule("/lib/crm-v003-types.ts");
  const now = new Date("2026-09-01T12:00:00.000Z");

  assert.equal(isTaskOverdue({ due_at: "2026-08-31T12:00:00.000Z", status: "open" }, now), true);
  assert.equal(isTaskOverdue({ due_at: "2026-08-31T12:00:00.000Z", status: "completed" }, now), false);
  assert.equal(isTaskOverdue({ due_at: "2026-09-02T12:00:00.000Z", status: "open" }, now), false);
});
