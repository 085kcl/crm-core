-- CRM Core v0.03.2 — DP-CRM-019 transactional notifications foundation
-- Additive migration for durable email notifications. No network calls occur in SQL.

create or replace function private.can_manage_notification_settings(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_workspace_role(p_workspace_id) in ('owner','admin');
$$;

revoke all on function private.can_manage_notification_settings(uuid) from public, anon;
grant execute on function private.can_manage_notification_settings(uuid) to authenticated, service_role;

create table public.notification_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  sender_name text not null,
  sender_email text,
  reply_to text,
  new_request_recipients text[] not null default '{}'::text[],
  customer_confirmation_enabled boolean not null default false,
  company_notification_enabled boolean not null default false,
  status_notifications_enabled boolean not null default false,
  provider text not null default 'resend',
  provider_configuration_ref text,
  template_map jsonb not null default '{}'::jsonb,
  crm_base_url text,
  configuration_version integer not null default 1,
  max_attempts smallint not null default 4,
  lease_seconds integer not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_settings_sender_name_check
    check (char_length(trim(sender_name)) between 1 and 120 and sender_name !~ E'[\r\n]'),
  constraint notification_settings_sender_email_check
    check (sender_email is null or (
      char_length(sender_email) <= 254
      and sender_email !~ E'[\r\n]'
      and position('@' in sender_email) > 1
    )),
  constraint notification_settings_reply_to_check
    check (reply_to is null or (
      char_length(reply_to) <= 254
      and reply_to !~ E'[\r\n]'
      and position('@' in reply_to) > 1
    )),
  constraint notification_settings_provider_check check (provider in ('resend')),
  constraint notification_settings_template_map_check check (jsonb_typeof(template_map) = 'object'),
  constraint notification_settings_version_check check (configuration_version > 0),
  constraint notification_settings_max_attempts_check check (max_attempts between 1 and 8),
  constraint notification_settings_lease_check check (lease_seconds between 30 and 900)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  intake_request_id uuid not null,
  outbox_event_id uuid not null,
  event_type text not null,
  intent_key text not null,
  channel text not null default 'email',
  recipient text not null,
  template_key text not null,
  template_variables jsonb not null default '{}'::jsonb,
  from_snapshot text not null,
  reply_to_snapshot text,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  delivery_key text not null,
  template_version text not null default 'v1',
  configuration_version integer not null,
  next_attempt_at timestamptz,
  processing_started_at timestamptz,
  lease_expires_at timestamptz,
  failure_kind text,
  retryable boolean not null default false,
  reconciliation_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_workspace_id_id_key unique (workspace_id, id),
  constraint notification_deliveries_delivery_key_key unique (delivery_key),
  constraint notification_deliveries_channel_check check (channel = 'email'),
  constraint notification_deliveries_recipient_check check (
    char_length(recipient) <= 254
    and recipient !~ E'[\r\n]'
    and position('@' in recipient) > 1
  ),
  constraint notification_deliveries_template_variables_check
    check (jsonb_typeof(template_variables) = 'object'),
  constraint notification_deliveries_provider_check check (provider = 'resend'),
  constraint notification_deliveries_status_check
    check (status in ('queued','processing','sent','delivered','failed')),
  constraint notification_deliveries_attempt_count_check check (attempt_count >= 0),
  constraint notification_deliveries_failure_kind_check
    check (failure_kind is null or failure_kind in ('transient','permanent','uncertain')),
  constraint notification_deliveries_workspace_intake_fkey
    foreign key (workspace_id, intake_request_id)
    references public.intake_requests(workspace_id, id) on delete cascade
);

create unique index uq_notification_deliveries_provider_message
  on public.notification_deliveries(provider, provider_message_id)
  where provider_message_id is not null;

create index idx_notification_deliveries_claim
  on public.notification_deliveries(status, next_attempt_at, queued_at)
  where status in ('queued','failed');

create index idx_notification_deliveries_intake
  on public.notification_deliveries(workspace_id, intake_request_id, queued_at desc);

create index idx_notification_deliveries_outbox
  on public.notification_deliveries(outbox_event_id, intent_key);

create table public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  delivery_id uuid not null,
  attempt_number integer not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text not null default 'processing',
  failure_kind text,
  sanitized_error text,
  provider_message_id text,
  correlation_id text not null,
  created_at timestamptz not null default now(),
  constraint notification_delivery_attempts_workspace_delivery_fkey
    foreign key (workspace_id, delivery_id)
    references public.notification_deliveries(workspace_id, id) on delete cascade,
  constraint notification_delivery_attempts_attempt_check check (attempt_number > 0),
  constraint notification_delivery_attempts_result_check
    check (result in ('processing','accepted','rejected','unknown')),
  constraint notification_delivery_attempts_failure_kind_check
    check (failure_kind is null or failure_kind in ('transient','permanent','uncertain')),
  constraint notification_delivery_attempts_unique_attempt
    unique (workspace_id, delivery_id, attempt_number)
);

create index idx_notification_delivery_attempts_delivery
  on public.notification_delivery_attempts(workspace_id, delivery_id, attempt_number desc);

create table public.notification_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  provider_message_id text,
  event_type text not null,
  payload_hash text not null,
  event_created_at timestamptz,
  workspace_id uuid references public.workspaces(id) on delete set null,
  delivery_id uuid,
  resolution_status text not null default 'unresolved',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint notification_provider_events_provider_check check (provider = 'resend'),
  constraint notification_provider_events_hash_check check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint notification_provider_events_resolution_check
    check (resolution_status in ('processed','duplicate','unresolved','ignored')),
  constraint notification_provider_events_provider_event_key
    unique (provider, provider_event_id),
  constraint notification_provider_events_workspace_delivery_fkey
    foreign key (workspace_id, delivery_id)
    references public.notification_deliveries(workspace_id, id) on delete set null
);

create index idx_notification_provider_events_message
  on public.notification_provider_events(provider, provider_message_id);

create or replace function private.normalize_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient text;
  v_normalized text[] := '{}'::text[];
begin
  new.sender_name := trim(new.sender_name);
  new.sender_email := nullif(lower(trim(new.sender_email)), '');
  new.reply_to := nullif(lower(trim(new.reply_to)), '');
  new.provider_configuration_ref := nullif(trim(new.provider_configuration_ref), '');
  new.crm_base_url := nullif(regexp_replace(trim(coalesce(new.crm_base_url, '')), '/+$', ''), '');

  foreach v_recipient in array coalesce(new.new_request_recipients, '{}'::text[])
  loop
    v_recipient := lower(trim(v_recipient));
    if v_recipient = '' then
      continue;
    end if;
    if char_length(v_recipient) > 254
       or v_recipient ~ E'[\r\n]'
       or position('@' in v_recipient) <= 1 then
      raise exception 'invalid_notification_recipient' using errcode = '22023';
    end if;
    if not (v_recipient = any(v_normalized)) then
      v_normalized := array_append(v_normalized, v_recipient);
    end if;
  end loop;

  new.new_request_recipients := v_normalized;

  if tg_op = 'UPDATE' then
    new.configuration_version := old.configuration_version + 1;
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_notification_settings() from public, anon, authenticated;
grant execute on function private.normalize_notification_settings() to service_role;

create trigger trg_notification_settings_normalize
before insert or update on public.notification_settings
for each row execute function private.normalize_notification_settings();

create trigger trg_notification_settings_updated_at
before update on public.notification_settings
for each row execute function public.set_updated_at();

create trigger trg_notification_deliveries_updated_at
before update on public.notification_deliveries
for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.notification_provider_events enable row level security;

create policy notification_settings_select on public.notification_settings
for select to authenticated
using (private.can_manage_notification_settings(workspace_id));

create policy notification_settings_insert on public.notification_settings
for insert to authenticated
with check (private.can_manage_notification_settings(workspace_id));

create policy notification_settings_update on public.notification_settings
for update to authenticated
using (private.can_manage_notification_settings(workspace_id))
with check (private.can_manage_notification_settings(workspace_id));

create policy notification_deliveries_select on public.notification_deliveries
for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy notification_delivery_attempts_select on public.notification_delivery_attempts
for select to authenticated
using (private.is_workspace_member(workspace_id));

revoke all on public.notification_settings, public.notification_deliveries,
  public.notification_delivery_attempts, public.notification_provider_events from anon;

grant select, insert, update on public.notification_settings to authenticated, service_role;
grant select on public.notification_deliveries, public.notification_delivery_attempts to authenticated;
grant all on public.notification_deliveries, public.notification_delivery_attempts,
  public.notification_provider_events to service_role;

-- Initial settings are deliberately disabled until sender/domain/recipients are
-- approved. This prevents live email from being enabled by a schema migration.
insert into public.notification_settings(
  workspace_id, sender_name, sender_email, reply_to, new_request_recipients,
  customer_confirmation_enabled, company_notification_enabled,
  status_notifications_enabled, provider, provider_configuration_ref,
  template_map, crm_base_url
)
select
  id,
  'CLASSY',
  null,
  null,
  '{}'::text[],
  false,
  false,
  false,
  'resend',
  'resend/default',
  jsonb_build_object(
    'intake_internal', 'crm-classy-intake-internal',
    'intake_received_neutral', 'crm-classy-intake-received',
    'status_update', 'crm-classy-status-update',
    'template_version', 'v1'
  ),
  'https://crm-core.nicolauflamel.chatgpt.site/app'
from public.workspaces
where slug = 'classy'
on conflict (workspace_id) do nothing;

insert into public.notification_settings(
  workspace_id, sender_name, sender_email, reply_to, new_request_recipients,
  customer_confirmation_enabled, company_notification_enabled,
  status_notifications_enabled, provider, provider_configuration_ref,
  template_map, crm_base_url
)
select
  id,
  'Perícias Fernandes',
  null,
  null,
  '{}'::text[],
  false,
  false,
  false,
  'resend',
  'resend/default',
  jsonb_build_object(
    'intake_internal', 'crm-fernandes-intake-internal',
    'intake_received_neutral', 'crm-fernandes-intake-received',
    'status_update', 'crm-fernandes-status-update',
    'template_version', 'v1'
  ),
  'https://crm-core.nicolauflamel.chatgpt.site/app'
from public.workspaces
where slug = 'fernandes'
on conflict (workspace_id) do nothing;

create or replace function public.materialize_intake_created_notifications(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.outbox_events%rowtype;
  v_intake public.intake_requests%rowtype;
  v_settings public.notification_settings%rowtype;
  v_recipient text;
  v_template text;
  v_template_version text;
  v_delivery_key text;
  v_inserted integer := 0;
  v_row_count integer := 0;
  v_contact text;
  v_crm_link text;
begin
  select * into v_event
  from public.outbox_events
  where id = p_event_id
  for update;

  if not found
     or v_event.event_type <> 'intake.created'
     or v_event.aggregate_type <> 'intake_request' then
    return 0;
  end if;

  if v_event.processed_at is not null then
    return 0;
  end if;

  select * into v_intake
  from public.intake_requests
  where workspace_id = v_event.workspace_id
    and id = v_event.aggregate_id;

  if not found then
    update public.outbox_events
    set last_error = 'notification_intake_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  select * into v_settings
  from public.notification_settings
  where workspace_id = v_event.workspace_id;

  if not found then
    update public.outbox_events
    set last_error = 'notification_settings_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  if not v_settings.company_notification_enabled
     and not v_settings.customer_confirmation_enabled then
    update public.outbox_events
    set processed_at = now(),
        last_error = 'notification_intents_suppressed_by_configuration'
    where id = v_event.id;
    return 0;
  end if;

  if v_settings.sender_email is null then
    update public.outbox_events
    set last_error = 'notification_sender_not_configured',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  if v_settings.company_notification_enabled
     and cardinality(v_settings.new_request_recipients) = 0 then
    update public.outbox_events
    set last_error = 'notification_internal_recipients_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  v_template_version := coalesce(v_settings.template_map ->> 'template_version', 'v1');
  v_contact := v_intake.customer_email ||
    case when v_intake.customer_phone is null then ''
         else ' · ' || v_intake.customer_phone end;
  v_crm_link := coalesce(v_settings.crm_base_url, '') ||
    '?intake=' || v_intake.id::text;

  if v_settings.company_notification_enabled then
    v_template := nullif(v_settings.template_map ->> 'intake_internal', '');
    if v_template is null then
      update public.outbox_events
      set last_error = 'notification_internal_template_missing',
          attempts = attempts + 1,
          available_at = now() + interval '5 minutes'
      where id = v_event.id;
      return 0;
    end if;

    foreach v_recipient in array v_settings.new_request_recipients
    loop
      v_delivery_key := encode(
        digest(
          v_event.workspace_id::text || ':' || v_event.id::text ||
          ':company_internal:' || lower(v_recipient) || ':email',
          'sha256'
        ),
        'hex'
      );

      insert into public.notification_deliveries(
        workspace_id, intake_request_id, outbox_event_id, event_type,
        intent_key, recipient, template_key, template_variables,
        from_snapshot, reply_to_snapshot, provider, delivery_key,
        template_version, configuration_version
      ) values (
        v_event.workspace_id,
        v_intake.id,
        v_event.id,
        v_event.event_type,
        'company_internal',
        lower(v_recipient),
        v_template,
        jsonb_build_object(
          'REFERENCE', v_intake.public_reference,
          'CUSTOMER_NAME', v_intake.customer_name,
          'CUSTOMER_CONTACT', v_contact,
          'CRM_LINK', v_crm_link
        ),
        v_settings.sender_name || ' <' || v_settings.sender_email || '>',
        v_settings.reply_to,
        v_settings.provider,
        v_delivery_key,
        v_template_version,
        v_settings.configuration_version
      )
      on conflict (delivery_key) do nothing;

      get diagnostics v_row_count = row_count;
      v_inserted := v_inserted + v_row_count;
    end loop;
  end if;

  if v_settings.customer_confirmation_enabled then
    v_template := nullif(v_settings.template_map ->> 'intake_received_neutral', '');
    if v_template is null then
      update public.outbox_events
      set last_error = 'notification_customer_template_missing',
          attempts = attempts + 1,
          available_at = now() + interval '5 minutes'
      where id = v_event.id;
      return v_inserted;
    end if;

    v_delivery_key := encode(
      digest(
        v_event.workspace_id::text || ':' || v_event.id::text ||
        ':customer_receipt:' || lower(v_intake.customer_email) || ':email',
        'sha256'
      ),
      'hex'
    );

    insert into public.notification_deliveries(
      workspace_id, intake_request_id, outbox_event_id, event_type,
      intent_key, recipient, template_key, template_variables,
      from_snapshot, reply_to_snapshot, provider, delivery_key,
      template_version, configuration_version
    ) values (
      v_event.workspace_id,
      v_intake.id,
      v_event.id,
      v_event.event_type,
      'customer_receipt',
      lower(v_intake.customer_email),
      v_template,
      jsonb_build_object(
        'CUSTOMER_NAME', v_intake.customer_name,
        'REFERENCE', v_intake.public_reference
      ),
      v_settings.sender_name || ' <' || v_settings.sender_email || '>',
      v_settings.reply_to,
      v_settings.provider,
      v_delivery_key,
      v_template_version,
      v_settings.configuration_version
    )
    on conflict (delivery_key) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end if;

  update public.outbox_events
  set processed_at = now(),
      last_error = null
  where id = v_event.id;

  return v_inserted;
end;
$$;

revoke all on function public.materialize_intake_created_notifications(uuid)
from public, anon, authenticated;
grant execute on function public.materialize_intake_created_notifications(uuid) to service_role;

create or replace function public.materialize_notification_batch(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_count integer := 0;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_materialization_limit' using errcode = '22023';
  end if;

  for v_event_id in
    select id
    from public.outbox_events
    where processed_at is null
      and available_at <= now()
      and event_type = 'intake.created'
      and aggregate_type = 'intake_request'
    order by created_at, id
    limit p_limit
  loop
    begin
      perform public.materialize_intake_created_notifications(v_event_id);
      v_count := v_count + 1;
    exception when others then
      update public.outbox_events
      set attempts = attempts + 1,
          last_error = 'notification_materialization_error',
          available_at = now() + interval '5 minutes'
      where id = v_event_id;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.materialize_notification_batch(integer)
from public, anon, authenticated;
grant execute on function public.materialize_notification_batch(integer) to service_role;

create or replace function public.expire_notification_leases()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notification_deliveries
  set status = 'failed',
      failure_kind = 'uncertain',
      last_error = 'worker_lease_expired',
      failed_at = coalesce(failed_at, now()),
      retryable = false,
      reconciliation_required = true,
      lease_expires_at = null
  where status = 'processing'
    and lease_expires_at is not null
    and lease_expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_notification_leases()
from public, anon, authenticated;
grant execute on function public.expire_notification_leases() to service_role;

create or replace function public.claim_notification_delivery(p_correlation_id text)
returns table (
  delivery_id uuid,
  workspace_id uuid,
  intake_request_id uuid,
  recipient text,
  template_key text,
  template_variables jsonb,
  from_snapshot text,
  reply_to_snapshot text,
  provider text,
  delivery_key text,
  attempt_number integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_delivery_id uuid;
  v_max_attempts integer;
  v_lease_seconds integer;
begin
  select d.id, s.max_attempts, s.lease_seconds
  into v_delivery_id, v_max_attempts, v_lease_seconds
  from public.notification_deliveries d
  join public.notification_settings s on s.workspace_id = d.workspace_id
  where (
      d.status = 'queued'
      or (
        d.status = 'failed'
        and d.retryable
        and not d.reconciliation_required
        and d.next_attempt_at is not null
        and d.next_attempt_at <= now()
      )
    )
    and d.attempt_count < s.max_attempts
  order by coalesce(d.next_attempt_at, d.queued_at), d.id
  for update of d skip locked
  limit 1;

  if not found then
    return;
  end if;

  select * into v_delivery
  from public.notification_deliveries
  where id = v_delivery_id;

  update public.notification_deliveries
  set status = 'processing',
      attempt_count = attempt_count + 1,
      processing_started_at = now(),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      next_attempt_at = null
  where id = v_delivery.id
  returning * into v_delivery;

  insert into public.notification_delivery_attempts(
    workspace_id, delivery_id, attempt_number, started_at, result, correlation_id
  ) values (
    v_delivery.workspace_id,
    v_delivery.id,
    v_delivery.attempt_count,
    now(),
    'processing',
    coalesce(nullif(trim(p_correlation_id), ''), gen_random_uuid()::text)
  );

  return query
  select
    v_delivery.id,
    v_delivery.workspace_id,
    v_delivery.intake_request_id,
    v_delivery.recipient,
    v_delivery.template_key,
    v_delivery.template_variables,
    v_delivery.from_snapshot,
    v_delivery.reply_to_snapshot,
    v_delivery.provider,
    v_delivery.delivery_key,
    v_delivery.attempt_count;
end;
$$;

revoke all on function public.claim_notification_delivery(text)
from public, anon, authenticated;
grant execute on function public.claim_notification_delivery(text) to service_role;

create or replace function public.record_notification_result(
  p_delivery_id uuid,
  p_attempt_number integer,
  p_result text,
  p_failure_kind text,
  p_sanitized_error text,
  p_provider_message_id text,
  p_correlation_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_settings public.notification_settings%rowtype;
  v_retry_at timestamptz;
begin
  if p_result not in ('accepted','rejected','unknown') then
    raise exception 'invalid_notification_result' using errcode = '22023';
  end if;

  if p_failure_kind is not null
     and p_failure_kind not in ('transient','permanent','uncertain') then
    raise exception 'invalid_notification_failure_kind' using errcode = '22023';
  end if;

  select * into v_delivery
  from public.notification_deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'notification_delivery_not_found' using errcode = 'P0002';
  end if;

  if v_delivery.status <> 'processing'
     or v_delivery.attempt_count <> p_attempt_number then
    raise exception 'notification_attempt_state_conflict' using errcode = '40001';
  end if;

  select * into v_settings
  from public.notification_settings
  where workspace_id = v_delivery.workspace_id;

  update public.notification_delivery_attempts
  set finished_at = now(),
      result = p_result,
      failure_kind = p_failure_kind,
      sanitized_error = nullif(left(coalesce(p_sanitized_error, ''), 500), ''),
      provider_message_id = nullif(trim(p_provider_message_id), ''),
      correlation_id = coalesce(nullif(trim(p_correlation_id), ''), correlation_id)
  where workspace_id = v_delivery.workspace_id
    and delivery_id = v_delivery.id
    and attempt_number = p_attempt_number;

  if p_result = 'accepted' then
    update public.notification_deliveries
    set status = 'sent',
        provider_message_id = nullif(trim(p_provider_message_id), ''),
        sent_at = coalesce(sent_at, now()),
        last_error = null,
        failure_kind = null,
        retryable = false,
        reconciliation_required = false,
        processing_started_at = null,
        lease_expires_at = null,
        next_attempt_at = null
    where id = v_delivery.id;

    return 'sent';
  end if;

  if p_result = 'unknown' or p_failure_kind = 'uncertain' then
    update public.notification_deliveries
    set status = 'failed',
        last_error = nullif(left(coalesce(p_sanitized_error, 'provider_result_uncertain'), 500), ''),
        failed_at = coalesce(failed_at, now()),
        failure_kind = 'uncertain',
        retryable = false,
        reconciliation_required = true,
        processing_started_at = null,
        lease_expires_at = null,
        next_attempt_at = null
    where id = v_delivery.id;

    return 'reconciliation_required';
  end if;

  if p_failure_kind = 'transient'
     and v_settings.max_attempts is not null
     and p_attempt_number < v_settings.max_attempts then
    v_retry_at := now() +
      case p_attempt_number
        when 1 then interval '2 minutes'
        when 2 then interval '10 minutes'
        else interval '30 minutes'
      end;
  else
    v_retry_at := null;
  end if;

  update public.notification_deliveries
  set status = 'failed',
      last_error = nullif(left(coalesce(p_sanitized_error, 'provider_rejected'), 500), ''),
      failed_at = coalesce(failed_at, now()),
      failure_kind = coalesce(p_failure_kind, 'permanent'),
      retryable = v_retry_at is not null,
      reconciliation_required = false,
      processing_started_at = null,
      lease_expires_at = null,
      next_attempt_at = v_retry_at
  where id = v_delivery.id;

  return case when v_retry_at is null then 'failed' else 'retry_scheduled' end;
end;
$$;

revoke all on function public.record_notification_result(
  uuid,integer,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.record_notification_result(
  uuid,integer,text,text,text,text,text
) to service_role;

create or replace function public.record_resend_webhook_event(
  p_provider_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_event_created_at timestamptz,
  p_payload_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.notification_deliveries%rowtype;
begin
  if p_provider_event_id is null or trim(p_provider_event_id) = ''
     or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_provider_event' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('resend:' || p_provider_event_id, 0));

  if exists (
    select 1
    from public.notification_provider_events
    where provider = 'resend'
      and provider_event_id = p_provider_event_id
  ) then
    return 'duplicate';
  end if;

  select * into v_delivery
  from public.notification_deliveries
  where provider = 'resend'
    and provider_message_id = p_provider_message_id
  limit 1
  for update;

  if not found then
    insert into public.notification_provider_events(
      provider, provider_event_id, provider_message_id, event_type,
      payload_hash, event_created_at, resolution_status
    ) values (
      'resend', p_provider_event_id, p_provider_message_id, p_event_type,
      p_payload_hash, p_event_created_at, 'unresolved'
    );
    return 'unresolved';
  end if;

  insert into public.notification_provider_events(
    provider, provider_event_id, provider_message_id, event_type,
    payload_hash, event_created_at, workspace_id, delivery_id,
    resolution_status, processed_at
  ) values (
    'resend', p_provider_event_id, p_provider_message_id, p_event_type,
    p_payload_hash, p_event_created_at, v_delivery.workspace_id, v_delivery.id,
    'processed', now()
  );

  if p_event_type = 'email.delivered' then
    update public.notification_deliveries
    set status = 'delivered',
        sent_at = coalesce(sent_at, p_event_created_at, now()),
        delivered_at = coalesce(delivered_at, p_event_created_at, now()),
        retryable = false,
        reconciliation_required = false,
        failure_kind = null,
        last_error = null
    where id = v_delivery.id;
  elsif p_event_type = 'email.sent' then
    if v_delivery.status not in ('delivered') then
      update public.notification_deliveries
      set status = 'sent',
          sent_at = coalesce(sent_at, p_event_created_at, now()),
          retryable = false,
          reconciliation_required = false
      where id = v_delivery.id;
    end if;
  elsif p_event_type in ('email.failed','email.bounced','email.suppressed','email.complained') then
    update public.notification_deliveries
    set status = case when status = 'delivered' then 'delivered' else 'failed' end,
        failed_at = coalesce(failed_at, p_event_created_at, now()),
        failure_kind = 'permanent',
        last_error = p_event_type,
        retryable = false,
        reconciliation_required = false
    where id = v_delivery.id;
  elsif p_event_type = 'email.delivery_delayed' then
    update public.notification_deliveries
    set last_error = 'email.delivery_delayed'
    where id = v_delivery.id;
  end if;

  return 'processed';
end;
$$;

revoke all on function public.record_resend_webhook_event(
  text,text,text,timestamptz,text
) from public, anon, authenticated;
grant execute on function public.record_resend_webhook_event(
  text,text,text,timestamptz,text
) to service_role;
