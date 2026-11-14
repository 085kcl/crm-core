-- CLASSY Connect v0.1: server-side Meta webhook ingress (additive).
-- SECURITY: provider account -> workspace is resolved only from an operator-provisioned
-- channel. The request payload is never allowed to supply a workspace_id.
-- This migration deliberately DOES NOT enable outbound automation or public access.

create table public.connect_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  external_account_id text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connect_channels_provider_check
    check (provider in ('instagram', 'messenger', 'whatsapp')),
  constraint connect_channels_account_check
    check (length(external_account_id) between 1 and 200),
  constraint connect_channels_provider_account_key
    unique (provider, external_account_id),
  constraint connect_channels_workspace_id_id_key unique (workspace_id, id)
);

create table public.connect_webhook_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null,
  provider_event_hash text not null,
  event_kind text not null default 'webhook',
  payload jsonb not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint connect_webhook_events_workspace_channel_fkey
    foreign key (workspace_id, channel_id)
    references public.connect_channels(workspace_id, id) on delete cascade,
  constraint connect_webhook_events_hash_check
    check (provider_event_hash ~ '^[0-9a-f]{64}$'),
  constraint connect_webhook_events_payload_check
    check (jsonb_typeof(payload) = 'object'),
  constraint connect_webhook_events_kind_check
    check (char_length(event_kind) between 1 and 80),
  constraint connect_webhook_events_status_check
    check (status in ('queued','processing','processed','failed')),
  constraint connect_webhook_events_attempt_check check (attempt_count >= 0),
  constraint connect_webhook_events_dedupe_key unique (channel_id, provider_event_hash)
);

create index idx_connect_webhook_events_claim
  on public.connect_webhook_events(status, received_at, id)
  where status in ('queued','failed');
create index idx_connect_webhook_events_workspace
  on public.connect_webhook_events(workspace_id, received_at desc);

create trigger trg_connect_channels_updated_at
before update on public.connect_channels
for each row execute function public.set_updated_at();

alter table public.connect_channels enable row level security;
alter table public.connect_webhook_events enable row level security;

-- No authenticated read/write policies in this increment. PII-containing payloads
-- remain invisible through the public Supabase Data API to regular users.
revoke all on public.connect_channels, public.connect_webhook_events
  from public, anon, authenticated;
grant select, insert, update, delete on public.connect_channels to service_role;
grant select, insert, update, delete on public.connect_webhook_events to service_role;

-- A single transaction persists a verified batch. Only a configured active
-- channel provides tenant authority; unknown accounts are discarded.
-- The signature is checked in the server route BEFORE this RPC is called.
create or replace function public.ingest_connect_webhook_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_inserted integer := 0;
begin
  if p_events is null
     or jsonb_typeof(p_events) <> 'array'
     or jsonb_array_length(p_events) > 1000 then
    raise exception 'connect_invalid_batch';
  end if;

  insert into public.connect_webhook_events
    (workspace_id, channel_id, provider_event_hash, event_kind, payload)
  select c.workspace_id, c.id, e.event_hash, e.event_kind, e.payload
    from jsonb_to_recordset(p_events) as e(
      provider text,
      external_account_id text,
      event_hash text,
      event_kind text,
      payload jsonb
    )
    join public.connect_channels c
      on c.provider = e.provider
     and c.external_account_id = e.external_account_id
     and c.active is true
   where e.event_hash ~ '^[0-9a-f]{64}$'
     and jsonb_typeof(e.payload) = 'object'
     and char_length(e.event_kind) between 1 and 80
  on conflict (channel_id, provider_event_hash) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.ingest_connect_webhook_events(jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_connect_webhook_events(jsonb) to service_role;

comment on table public.connect_channels is
  'Configured Meta channel bindings; populate/activate only after verified platform onboarding.';
comment on table public.connect_webhook_events is
  'Private, deduplicated ingress queue. Set retention and redaction policies before live traffic.';
