# CRM Core — Hostinger VPS deployment gate

This directory contains the deployment contract for running CRM Core as an isolated Node.js upstream before routing `classyrp.com.br/crm*` to it.

## Why VPS / container

CRM Core uses a server-side Node runtime and requires precise control of runtime variables and reverse-proxy behavior. Hostinger documents VPS as the option with full root access and custom reverse-proxy support, and its Docker Manager supports multiple isolated applications behind a reverse proxy.

The CRM is built with:

- Node.js 22.13.0;
- Vinext 0.1.0 / Next application surface;
- `basePath=/crm`;
- standalone Node output;
- Supabase as the canonical backend.

## Network boundary

The Compose file binds the CRM only to:

`127.0.0.1:3100 -> container:3000`

Do not expose port 3000 or 3100 directly to the public internet. Public traffic must arrive through the VPS reverse proxy.

## Runtime variables

For local/VPS manual staging, copy:

`deploy/hostinger/.env.production.example`

to:

`deploy/hostinger/.env.production`

and keep the populated file outside Git. The Compose file does not depend on an env file by name; variables are injected explicitly so the same definition works with Hostinger's GitHub deploy action.

Minimum interactive CRM login requires:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Privileged bridge/notification routes additionally require the server-side secret variables listed in the example file.

## Staging start

From `deploy/hostinger`:

```bash
docker compose -p crm-core-staging --env-file .env.production build --pull
docker compose -p crm-core-staging --env-file .env.production up -d
node smoke.mjs http://127.0.0.1:3100
node wait-healthy.mjs "$(docker compose -p crm-core-staging ps -q crm-core)"
docker compose -p crm-core-staging ps
```

The smoke gate must pass before any public routing is changed.

## Reverse-proxy contract

For the final same-origin topology, the edge proxy must route:

```text
/crm
/crm/*
```

to:

```text
http://127.0.0.1:3100
```

The proxy must **preserve the `/crm` prefix**.

Do not configure a rewrite that strips `/crm`, because CRM Core is compiled with `basePath=/crm`.

The proxy should preserve the original host/protocol forwarding headers and request method/body. TLS terminates at the public proxy.

## Recommended activation order

1. Build the container.
2. Start it on loopback only.
3. Run `smoke.mjs`.
4. Configure a non-production route or temporary host to the loopback upstream.
5. Validate login, refresh, workspace selection, Intake Inbox, logout and password recovery.
6. Configure the production `/crm*` route.
7. Re-run authenticated smoke tests through `https://classyrp.com.br/crm`.
8. Only then enable/merge the CLASSY navigation entry.

## Rollback

Remove or disable the public `/crm*` proxy rule. The CLASSY public site remains independent and the CRM container can remain running on loopback for diagnosis.

No DNS, Supabase migration, production database or secret change is performed by these files.


## GitHub Actions staging deploy

The repository includes `.github/workflows/deploy-hostinger-staging.yml`.

It is manual-only (`workflow_dispatch`) and requires typing `deploy-staging`. Configure a protected GitHub Environment named `hostinger-staging` with:

- secret `HOSTINGER_API_KEY`;
- variable `HOSTINGER_VM_ID`;
- a read-only SSH deploy key configured on the audited VPS for this private repository;
- variable `HOSTINGER_PRIVATE_REPO_ACCESS_VERIFIED=true` only after that access is verified;
- secret `CRM_STAGING_SUPABASE_URL`;
- secret `CRM_STAGING_SUPABASE_PUBLISHABLE_KEY`;
- optional privileged/runtime secrets referenced by the workflow when those routes are enabled.

Do not place secret values in repository variables, workflow YAML or documentation.

The workflow deploys the Compose project as `crm-core-staging`. It does not change DNS or enable the production `/crm*` route.


## Native Node packaging (2026-10-06)

`CRM_RUNTIME_TARGET=node npm run build` selects Vinext's native Node/RSC entry.
The default build keeps the existing Cloudflare Worker target for Sites/tests.
Do not use the Worker entry as the VPS entry: its wrapper does not export the
asset prefix used by the Node static server, producing 404s under `/crm/_next/static/`.

The builder works in `/srv/crm-core`. A controlled build of the same snapshot
under `/app` reproduced the 307 self-loop; the root path overlaps the nested
`app/app` source layout. Avoid that build directory. This is a build-path issue,
not a Supabase/authentication failure.

Vinext's 0.1.0 standalone collector follows dependencies and its externals manifest,
but its Node runtime also imports the Vite peer through `build/report.js`.
`scripts/package-node-standalone.mjs` adds only `vite` to that manifest and uses
the pinned upstream collector for the transitive dependency closure. React and
React DOM are discovered by the native Node build. The helper fails closed on
a Vinext version change so this compatibility measure must be revalidated.
The image copies only `dist/standalone/`, never the builder node_modules.

CI verifies both the existing Worker tests and the native Node build. The latter
is copied to an unrelated temporary directory and booted without project packages
or application credentials. Smoke requires both pages, generated JS/CSS assets,
and JSON 401 from the unauthenticated workspace API. Container CI additionally
requires HEALTHY within 90 seconds; starting forever is a failure.

## Remaining staging preflight

Do not dispatch until the exact candidate commit has a green application,
isolated standalone and container CI run. Verify the correct VPS, Docker Manager,
existing proxy, available loopback port and staging Supabase project first.
Environment/secret availability must be confirmed separately; their names in YAML
are not evidence that they exist. Never print their values.

For TLS termination, Vinext 0.1.0 honors X-Forwarded-Proto only when
`VINEXT_TRUST_PROXY=1` or a nonempty `VINEXT_TRUSTED_HOSTS` is set. Configure this
only after verifying the trusted proxy boundary. A containerized proxy cannot
reach the host's 127.0.0.1 automatically: validate its networking before applying
the example. No proxy configuration is activated by this PR.

Still required: staging authenticated login/invalid login, refresh, workspace
selection/switch, dashboard, contacts, Intake Inbox/detail, logout, password
recovery, cookie Path=/crm, API prefix and no navigation escape. Then validate
staging proxy/same-origin before a separate production gate. CLASSY PR #7 stays draft.

## Staging workflow review

The former `hostinger/deploy-action@v1` reference returned 404 on 2026-10-06.
Hostinger's current repository documents `hostinger/deploy-on-vps@v2`; the v2 tag
resolves to commit `b0868cec74bfa63af6bfa7bdb0dfee2f9bef13ea` and explicitly removes
PAT support. The workflow is pinned to that reviewed commit. No existing secret
was changed or deleted. Private repository access must be verified using the
VPS SSH deploy key before setting the verification variable above.

The dispatch remains manual, requires `deploy-staging`, uses the protected
`hostinger-staging` environment and now requires a successful push CI run for
its exact SHA. Missing configuration prevents execution. The action only reports
that deployment was initiated; that is NOT evidence of a healthy runtime. VPS
smoke, HEALTHY, authenticated flows and staging proxy validation remain separate.

References (consulted 2026-10-06):
- Hostinger. (n.d.). Deploy to Hostinger VPS GitHub Action. https://github.com/hostinger/deploy-on-vps/tree/v2
- Hostinger. (n.d.). How to deploy from private GitHub repository on Hostinger Docker Manager. https://www.hostinger.com/support/how-to-deploy-from-private-github-repository-on-hostinger-docker-manager/
- Cloudflare. (n.d.). Vinext standalone output. https://github.com/cloudflare/vinext


## HTTPS staging validation — 2026-10-07

The Hostinger VPS staging endpoint was validated through Nginx at:

`https://crm-staging.classyrp.com.br/crm`

The container remains bound only to `127.0.0.1:3100`.

Authenticated HTTPS initially returned `403 Requisição não autorizada` because Vinext ignored `X-Forwarded-Proto` by default and reconstructed the upstream request URL as HTTP. This caused the CRM same-origin mutation guard to compare:

- browser origin: `https://crm-staging.classyrp.com.br`;
- reconstructed request origin: `http://crm-staging.classyrp.com.br`.

The staging proxy boundary was verified before enabling proxy trust: Nginx is the local TLS terminator and the CRM upstream is loopback-only. The Compose runtime therefore sets:

`VINEXT_TRUST_PROXY=1`

This is required for the current Nginx deployment and must not be removed unless the proxy topology changes and the same-origin security behavior is revalidated.

Validated through the HTTPS staging endpoint:

- valid login;
- FERNANDES workspace selection;
- dashboard;
- Intake Inbox and detail;
- Contacts;
- session persistence after refresh;
- logout;
- `crm_access_token` and `crm_refresh_token` with `Path=/crm`, `Secure`, `HttpOnly`, and `SameSite=Lax`.

Password-recovery email redirect remains a separate gate before production.
