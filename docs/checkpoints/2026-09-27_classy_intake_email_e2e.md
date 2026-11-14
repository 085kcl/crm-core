# CRM Core — Technical Checkpoint — 2026-09-27

## Scope

Urgent CLASSY intake and transactional-email activation in FERNANDES staging only.

## Confirmed state

- Sender domain `classyrp.com.br` is verified in Resend.
- Sender: `CLASSY <contato@classyrp.com.br>`.
- Internal recipient: `classycorrespondente@gmail.com`.
- CLASSY customer receipt and internal notification templates are published.
- CLASSY notification settings in FERNANDES staging have customer confirmation and company notification enabled.
- Supabase Edge Functions active:
  - `crm-notification-dispatch`
  - `crm-resend-webhook`
  - `crm-classy-intake-bridge`
- Notification dispatcher is scheduled through `pg_cron` + `pg_net`.
- Runtime/provider credentials are stored outside Git in Supabase Vault.
- CLASSY site bridge authentication uses a dedicated bearer secret stored as `crm_classy_bridge_token`.

## E2E evidence

Controlled bridge test created intake:

- public reference: `CLA-2026-000002`
- bridge response: HTTP 201
- contact state: matched
- lead link state: linked

Notification results:

- `company_internal` → `classycorrespondente@gmail.com` → `delivered`
- `customer_receipt` → controlled test mailbox → `delivered`
- sender snapshot for both: `CLASSY <contato@classyrp.com.br>`
- provider reconciliation captured `email.sent` and `email.delivered`.

## Git state

- Notification runtime merged to CRM Core main: `9f4632db22df33838ac55f45828f150bb95bfbbb`.
- CLASSY Site intake bridge merged to CRM Core main: `3331525dec2b23a0b59bb74865ec369a298b7a54`.
- CLASSY public-site integration merged to `diemfdieoficial-cloud/classy-site`: `1fb597cc5dabfe64eb3d68fa7b88afe74c5f9541`.
- Runtime configuration documentation merged to CLASSY site main: `094bdf6bc9deee88e47701c1a9afce5fa3126d54`.

## Remaining activation gate

The hosted CLASSY Site still needs these values configured in ChatGPT Sites settings before the public form can invoke the CRM bridge:

- `CRM_CORE_INTAKE_URL=https://fnzcmoydjlarelotnmon.supabase.co/functions/v1/crm-classy-intake-bridge`
- `CRM_CORE_BRIDGE_TOKEN=<secret matching Supabase Vault crm_classy_bridge_token>`

The token must not be committed to Git or copied into normal documentation.

After hosted values are set, save a new Site version, review it, deploy it, and run one controlled submission from the public `/diagnostico` flow.

## Production boundary

CLASSY production Supabase project remains unchanged. No production promotion is covered by this checkpoint.
