-- CRM Core v0.03.2 — DP-CRM-018 / CLASSY bridge foundation
-- Additive migration. Existing CRM v0.03 objects and contracts remain unchanged.
-- Public bridge ingress is server-to-server. anon/authenticated cannot execute
-- public.submit_intake_bridge; only the server-side service role may call it.

create table public.intake_statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  label text not null,
  position integer not null default 0,
  is_initial boolean not null default false,
  is_terminal boolean not null default false,
  customer_notification_enabled boolean not null default false,
  active boolean not null default true,
  inbox_bucket text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_statuses_key_check check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint intake_statuses_label_check check (char_length(trim(label)) between 1 and 120),
  constraint intake_statuses_position_check check (position >= 0),
  constraint intake_statuses_bucket_check
    check (inbox_bucket in ('new','in_progress','awaiting_customer','closed')),
  constraint intake_statuses_initial_not_terminal_check check (not (is_initial and is_terminal)),
  constraint intake_statuses_workspace_id_id_key unique (workspace_id, id),
  constraint intake_statuses_workspace_key_key unique (workspace_id, key)
);

create unique index uq_intake_statuses_one_active_initial
on public.intake_statuses(workspace_id)
where is_initial and active;

create table public.intake_form_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_key text not null,
  form_type text not null,
  active boolean not null default true,
  schema_version integer not null default 1,
  source text not null default 'intake/pre_analysis',
  reference_prefix text not null,
  reference_timezone text not null default 'UTC',
  create_lead boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_form_configs_form_key_check
    check (form_key ~ '^[a-z0-9][a-z0-9_-]{2,95}$'),
  constraint intake_form_configs_form_type_check
    check (form_type ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint intake_form_configs_schema_version_check check (schema_version > 0),
  constraint intake_form_configs_prefix_check check (reference_prefix ~ '^[A-Z0-9]{2,8}$'),
  constraint intake_form_configs_workspace_id_id_key unique (workspace_id, id),
  constraint intake_form_configs_form_key_key unique (form_key),
  constraint intake_form_configs_workspace_type_key unique (workspace_id, form_type)
);

create table public.intake_reference_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reference_year integer not null,
  next_value bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, reference_year),
  constraint intake_reference_counters_year_check check (reference_year between 2000 and 9999),
  constraint intake_reference_counters_next_check check (next_value > 0)
);

create table public.intake_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  public_reference text not null,
  form_type text not null,
  source text not null,
  contact_id uuid,
  lead_id uuid,
  status_id uuid not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  payload jsonb not null default '{}'::jsonb,
  assigned_to uuid,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  form_schema_version integer not null default 1,
  idempotency_key_hash text not null,
  request_hash text not null,
  row_version integer not null default 1,
  contact_match_state text not null,
  lead_link_state text not null,
  constraint intake_requests_workspace_id_id_key unique (workspace_id, id),
  constraint intake_requests_workspace_reference_key unique (workspace_id, public_reference),
  constraint intake_requests_idempotency_key
    unique (workspace_id, form_type, idempotency_key_hash),
  constraint intake_requests_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint intake_requests_schema_version_check check (form_schema_version > 0),
  constraint intake_requests_row_version_check check (row_version > 0),
  constraint intake_requests_match_state_check
    check (contact_match_state in ('new','matched','needs_review')),
  constraint intake_requests_lead_state_check
    check (lead_link_state in ('created','linked','pending_review','not_required')),
  constraint intake_requests_workspace_contact_fkey
    foreign key (workspace_id, contact_id)
    references public.contacts(workspace_id, id) on delete restrict,
  constraint intake_requests_workspace_lead_fkey
    foreign key (workspace_id, lead_id)
    references public.leads(workspace_id, id) on delete restrict,
  constraint intake_requests_workspace_status_fkey
    foreign key (workspace_id, status_id)
    references public.intake_statuses(workspace_id, id) on delete restrict,
  constraint intake_requests_workspace_assignee_fkey
    foreign key (workspace_id, assigned_to)
    references public.workspace_members(workspace_id, user_id) on delete restrict
);

create table public.intake_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  intake_request_id uuid not null,
  from_status_id uuid,
  to_status_id uuid not null,
  from_status_key text,
  from_status_label text,
  to_status_key text not null,
  to_status_label text not null,
  actor_user_id uuid references auth.users(id),
  actor_type text not null default 'system',
  changed_at timestamptz not null default now(),
  comment text,
  change_source text not null default 'system',
  request_id text not null,
  resulting_version integer not null,
  customer_notification_enabled_snapshot boolean not null default false,
  constraint intake_status_history_actor_type_check
    check (actor_type in ('user','system','integration')),
  constraint intake_status_history_resulting_version_check check (resulting_version > 0),
  constraint intake_status_history_workspace_intake_fkey
    foreign key (workspace_id, intake_request_id)
    references public.intake_requests(workspace_id, id) on delete cascade,
  constraint intake_status_history_workspace_to_status_fkey
    foreign key (workspace_id, to_status_id)
    references public.intake_statuses(workspace_id, id) on delete restrict,
  constraint intake_status_history_workspace_from_status_fkey
    foreign key (workspace_id, from_status_id)
    references public.intake_statuses(workspace_id, id) on delete restrict,
  constraint intake_status_history_request_key
    unique (workspace_id, intake_request_id, request_id)
);

create table public.integration_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_system text not null,
  external_entity_type text not null,
  external_id text not null,
  crm_entity_type text not null,
  crm_entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_links_source_check
    check (source_system ~ '^[a-z][a-z0-9_-]{1,62}$'),
  constraint integration_links_external_type_check
    check (external_entity_type ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint integration_links_crm_type_check
    check (crm_entity_type in ('intake_request','contact','lead','company','deal')),
  constraint integration_links_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint integration_links_external_key
    unique (workspace_id, source_system, external_entity_type, external_id)
);

create index idx_intake_requests_workspace_submitted
  on public.intake_requests(workspace_id, submitted_at desc, id desc);
create index idx_intake_requests_workspace_status
  on public.intake_requests(workspace_id, status_id, submitted_at desc);
create index idx_intake_requests_workspace_contact
  on public.intake_requests(workspace_id, contact_id);
create index idx_intake_requests_workspace_lead
  on public.intake_requests(workspace_id, lead_id);
create index idx_intake_status_history_intake
  on public.intake_status_history(workspace_id, intake_request_id, changed_at, id);
create index idx_integration_links_crm
  on public.integration_links(workspace_id, crm_entity_type, crm_entity_id);

create trigger trg_intake_statuses_updated_at
before update on public.intake_statuses
for each row execute function public.set_updated_at();

create trigger trg_intake_form_configs_updated_at
before update on public.intake_form_configs
for each row execute function public.set_updated_at();

create trigger trg_intake_requests_updated_at
before update on public.intake_requests
for each row execute function public.set_updated_at();

create trigger trg_integration_links_updated_at
before update on public.integration_links
for each row execute function public.set_updated_at();

create trigger trg_intake_requests_active_assignee
before insert or update on public.intake_requests
for each row execute function private.ensure_active_workspace_member_reference('assigned_to');

create trigger trg_intake_requests_audit
after insert or update or delete on public.intake_requests
for each row execute function private.audit_tenant_row_change();

create trigger trg_integration_links_audit
after insert or update or delete on public.integration_links
for each row execute function private.audit_tenant_row_change();

alter table public.intake_statuses enable row level security;
alter table public.intake_form_configs enable row level security;
alter table public.intake_reference_counters enable row level security;
alter table public.intake_requests enable row level security;
alter table public.intake_status_history enable row level security;
alter table public.integration_links enable row level security;

create policy intake_statuses_select on public.intake_statuses
for select to authenticated using (private.is_workspace_member(workspace_id));

create policy intake_statuses_insert on public.intake_statuses
for insert to authenticated
with check (private.can_manage_workspace_configuration(workspace_id));

create policy intake_statuses_update on public.intake_statuses
for update to authenticated
using (private.can_manage_workspace_configuration(workspace_id))
with check (private.can_manage_workspace_configuration(workspace_id));

create policy intake_form_configs_select on public.intake_form_configs
for select to authenticated using (private.is_workspace_member(workspace_id));

create policy intake_form_configs_insert on public.intake_form_configs
for insert to authenticated
with check (private.can_manage_workspace_configuration(workspace_id));

create policy intake_form_configs_update on public.intake_form_configs
for update to authenticated
using (private.can_manage_workspace_configuration(workspace_id))
with check (private.can_manage_workspace_configuration(workspace_id));

create policy intake_requests_select on public.intake_requests
for select to authenticated using (private.is_workspace_member(workspace_id));

create policy intake_status_history_select on public.intake_status_history
for select to authenticated using (private.is_workspace_member(workspace_id));

create policy integration_links_select on public.integration_links
for select to authenticated using (private.is_workspace_member(workspace_id));

revoke all on public.intake_statuses, public.intake_form_configs,
  public.intake_reference_counters, public.intake_requests,
  public.intake_status_history, public.integration_links from anon;

grant select, insert, update on public.intake_statuses to authenticated, service_role;
grant select, insert, update on public.intake_form_configs to authenticated, service_role;
grant all on public.intake_reference_counters to service_role;
grant select on public.intake_requests to authenticated;
grant all on public.intake_requests to service_role;
grant select on public.intake_status_history to authenticated;
grant all on public.intake_status_history to service_role;
grant select on public.integration_links to authenticated;
grant all on public.integration_links to service_role;

-- Initial status vocabularies for the two internal workspaces.
insert into public.intake_statuses
  (workspace_id, key, label, position, is_initial, is_terminal,
   customer_notification_enabled, active, inbox_bucket)
select w.id, s.key, s.label, s.position, s.is_initial, s.is_terminal, s.notify, true, s.bucket
from public.workspaces w
cross join lateral (
  values
    ('received','Recebida',0,true,false,false,'new'),
    ('triage','Em triagem',10,false,false,false,'in_progress'),
    ('pre_analysis','Em pré-análise',20,false,false,true,'in_progress'),
    ('awaiting_documents','Aguardando documentos',30,false,false,true,'awaiting_customer'),
    ('awaiting_customer','Aguardando cliente',40,false,false,true,'awaiting_customer'),
    ('forwarded','Encaminhada',50,false,false,true,'in_progress'),
    ('completed','Concluída',90,false,true,true,'closed'),
    ('cancelled','Cancelada',100,false,true,true,'closed')
) as s(key,label,position,is_initial,is_terminal,notify,bucket)
where w.slug = 'classy'
on conflict (workspace_id, key) do nothing;

insert into public.intake_statuses
  (workspace_id, key, label, position, is_initial, is_terminal,
   customer_notification_enabled, active, inbox_bucket)
select w.id, s.key, s.label, s.position, s.is_initial, s.is_terminal, s.notify, true, s.bucket
from public.workspaces w
cross join lateral (
  values
    ('received','Recebida',0,true,false,false,'new'),
    ('triage','Em triagem',10,false,false,false,'in_progress'),
    ('awaiting_documents','Aguardando documentos',20,false,false,true,'awaiting_customer'),
    ('technical_analysis','Em análise técnica',30,false,false,true,'in_progress'),
    ('awaiting_customer','Aguardando cliente',40,false,false,true,'awaiting_customer'),
    ('proposal_sent','Proposta enviada',50,false,false,true,'in_progress'),
    ('contracted','Contratada',80,false,true,true,'closed'),
    ('completed','Concluída',90,false,true,true,'closed'),
    ('archived','Arquivada',100,false,true,false,'closed')
) as s(key,label,position,is_initial,is_terminal,notify,bucket)
where w.slug = 'fernandes'
on conflict (workspace_id, key) do nothing;

insert into public.intake_form_configs
  (workspace_id, form_key, form_type, active, schema_version, source,
   reference_prefix, reference_timezone, create_lead)
select id, 'classy-pre-analysis', 'pre_analysis', true, 1,
  'intake/pre_analysis', 'CLA', 'America/Sao_Paulo', true
from public.workspaces
where slug = 'classy'
on conflict (form_key) do nothing;

insert into public.intake_form_configs
  (workspace_id, form_key, form_type, active, schema_version, source,
   reference_prefix, reference_timezone, create_lead)
select id, 'fernandes-case-pre-analysis', 'case_pre_analysis', true, 1,
  'intake/pre_analysis', 'FER', 'America/Sao_Paulo', true
from public.workspaces
where slug = 'fernandes'
on conflict (form_key) do nothing;

create or replace function public.submit_intake_bridge(
  p_form_key text,
  p_idempotency_key_hash text,
  p_request_hash text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_payload jsonb,
  p_correlation_id text,
  p_external_source_system text default null,
  p_external_entity_type text default null,
  p_external_id text default null
)
returns table (
  created boolean,
  public_reference text,
  received_at timestamptz,
  contact_match_state text,
  lead_link_state text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.intake_form_configs%rowtype;
  v_existing public.intake_requests%rowtype;
  v_status public.intake_statuses%rowtype;
  v_intake public.intake_requests%rowtype;
  v_contact_id uuid;
  v_lead_id uuid;
  v_candidate_count integer := 0;
  v_lead_count integer := 0;
  v_match_state text;
  v_lead_state text;
  v_email text := lower(trim(p_customer_email));
  v_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g'), '');
  v_name text := trim(p_customer_name);
  v_first_name text;
  v_last_name text;
  v_reference_year integer;
  v_sequence bigint;
  v_sequence_text text;
  v_request_id text := coalesce(nullif(trim(p_correlation_id), ''), gen_random_uuid()::text);
  v_external_existing uuid;
begin
  select *
  into v_form
  from public.intake_form_configs
  where form_key = p_form_key
    and active
  limit 1;

  if not found then
    raise exception 'intake_form_not_available' using errcode = 'P0002';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'intake_payload_must_be_object' using errcode = '22023';
  end if;

  if octet_length(p_payload::text) > 32768 then
    raise exception 'intake_payload_too_large' using errcode = '22023';
  end if;

  if v_name = '' or char_length(v_name) > 160
     or v_email is null or v_email = '' or char_length(v_email) > 254
     or position('@' in v_email) <= 1 then
    raise exception 'intake_customer_identity_invalid' using errcode = '22023';
  end if;

  if p_customer_phone is not null and char_length(trim(p_customer_phone)) > 40 then
    raise exception 'intake_phone_invalid' using errcode = '22023';
  end if;

  if p_idempotency_key_hash is null
     or p_request_hash is null
     or p_idempotency_key_hash !~ '^[a-f0-9]{64}$'
     or p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'intake_hash_invalid' using errcode = '22023';
  end if;

  if (p_external_source_system is null)
     <> (p_external_entity_type is null)
     or (p_external_source_system is null)
     <> (p_external_id is null) then
    raise exception 'integration_identity_incomplete' using errcode = '22023';
  end if;

  -- Same retry key is serialized to guarantee one intake/contact/lead/outbox.
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_form.workspace_id::text || ':' || v_form.form_type || ':' || p_idempotency_key_hash,
      0
    )
  );

  select *
  into v_existing
  from public.intake_requests
  where workspace_id = v_form.workspace_id
    and form_type = v_form.form_type
    and idempotency_key_hash = p_idempotency_key_hash
  limit 1;

  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception 'intake_idempotency_conflict' using errcode = '23505';
    end if;

    return query
    select false, v_existing.public_reference, v_existing.submitted_at,
      v_existing.contact_match_state, v_existing.lead_link_state;
    return;
  end if;

  -- external_id is a second durable identity for legacy/pseudo-CRM migration.
  if p_external_source_system is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        v_form.workspace_id::text || ':external:' ||
        lower(trim(p_external_source_system)) || ':' ||
        lower(trim(p_external_entity_type)) || ':' ||
        trim(p_external_id),
        0
      )
    );

    select crm_entity_id
    into v_external_existing
    from public.integration_links
    where workspace_id = v_form.workspace_id
      and source_system = lower(trim(p_external_source_system))
      and external_entity_type = lower(trim(p_external_entity_type))
      and external_id = trim(p_external_id)
      and crm_entity_type = 'intake_request'
    limit 1;

    if found then
      select *
      into v_existing
      from public.intake_requests
      where workspace_id = v_form.workspace_id
        and id = v_external_existing;

      if found and v_existing.request_hash = p_request_hash then
        return query
        select false, v_existing.public_reference, v_existing.submitted_at,
          v_existing.contact_match_state, v_existing.lead_link_state;
        return;
      end if;

      raise exception 'integration_external_id_conflict' using errcode = '23505';
    end if;
  end if;

  select *
  into v_status
  from public.intake_statuses
  where workspace_id = v_form.workspace_id
    and active
    and is_initial
  limit 1;

  if not found then
    raise exception 'intake_initial_status_missing' using errcode = '23514';
  end if;

  -- Serialize exact identifiers so simultaneous independent submissions do not
  -- create duplicate contacts for the same normalized identity.
  perform pg_advisory_xact_lock(
    hashtextextended(v_form.workspace_id::text || ':contact-email:' || v_email, 0)
  );
  if v_phone is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_form.workspace_id::text || ':contact-phone:' || v_phone, 0)
    );
  end if;

  with candidates as (
    select distinct id
    from public.contacts
    where workspace_id = v_form.workspace_id
      and (
        (email is not null and lower(trim(email)) = v_email)
        or
        (v_phone is not null
          and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone)
        or
        (v_phone is not null
          and regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g') = v_phone)
      )
  )
  select count(*), (array_agg(id order by id))[1]
  into v_candidate_count, v_contact_id
  from candidates;

  if v_candidate_count = 0 then
    v_first_name := split_part(v_name, ' ', 1);
    v_last_name := nullif(trim(substr(v_name, char_length(v_first_name) + 1)), '');

    insert into public.contacts(workspace_id, first_name, last_name, email, phone)
    values (v_form.workspace_id, v_first_name, v_last_name, v_email, p_customer_phone)
    returning id into v_contact_id;

    v_match_state := 'new';
  elsif v_candidate_count = 1 then
    v_match_state := 'matched';
  else
    v_contact_id := null;
    v_match_state := 'needs_review';
  end if;

  if not v_form.create_lead then
    v_lead_state := 'not_required';
  elsif v_contact_id is null then
    v_lead_state := 'pending_review';
  else
    perform pg_advisory_xact_lock(
      hashtextextended(v_form.workspace_id::text || ':active-lead:' || v_contact_id::text, 0)
    );

    select count(*), (array_agg(id order by id))[1]
    into v_lead_count, v_lead_id
    from public.leads
    where workspace_id = v_form.workspace_id
      and contact_id = v_contact_id
      and status in ('new','working','qualified');

    if v_lead_count = 0 then
      insert into public.leads(workspace_id, contact_id, source)
      values (v_form.workspace_id, v_contact_id, v_form.source)
      returning id into v_lead_id;
      v_lead_state := 'created';
    elsif v_lead_count = 1 then
      v_lead_state := 'linked';
    else
      v_lead_id := null;
      v_lead_state := 'pending_review';
    end if;
  end if;

  v_reference_year :=
    extract(year from timezone(v_form.reference_timezone, now()))::integer;

  insert into public.intake_reference_counters(workspace_id, reference_year, next_value)
  values (v_form.workspace_id, v_reference_year, 2)
  on conflict (workspace_id, reference_year)
  do update set
    next_value = public.intake_reference_counters.next_value + 1,
    updated_at = now()
  returning next_value - 1 into v_sequence;

  v_sequence_text := v_sequence::text;
  if char_length(v_sequence_text) < 6 then
    v_sequence_text := lpad(v_sequence_text, 6, '0');
  end if;

  insert into public.intake_requests(
    workspace_id, public_reference, form_type, source,
    contact_id, lead_id, status_id,
    customer_name, customer_email, customer_phone, payload,
    form_schema_version, idempotency_key_hash, request_hash,
    contact_match_state, lead_link_state
  ) values (
    v_form.workspace_id,
    v_form.reference_prefix || '-' || v_reference_year::text || '-' || v_sequence_text,
    v_form.form_type,
    v_form.source,
    v_contact_id,
    v_lead_id,
    v_status.id,
    v_name,
    v_email,
    p_customer_phone,
    p_payload,
    v_form.schema_version,
    p_idempotency_key_hash,
    p_request_hash,
    v_match_state,
    v_lead_state
  )
  returning * into v_intake;

  insert into public.intake_status_history(
    workspace_id, intake_request_id,
    from_status_id, to_status_id,
    from_status_key, from_status_label,
    to_status_key, to_status_label,
    actor_type, change_source, request_id,
    resulting_version, customer_notification_enabled_snapshot
  ) values (
    v_intake.workspace_id, v_intake.id,
    null, v_status.id,
    null, null,
    v_status.key, v_status.label,
    'integration', 'intake.created', v_request_id,
    v_intake.row_version, v_status.customer_notification_enabled
  );

  insert into public.outbox_events(
    workspace_id, event_type, aggregate_type, aggregate_id, payload
  ) values (
    v_intake.workspace_id,
    'intake.created',
    'intake_request',
    v_intake.id,
    jsonb_build_object(
      'public_reference', v_intake.public_reference,
      'form_type', v_intake.form_type,
      'form_key', v_form.form_key,
      'source', v_intake.source,
      'contact_match_state', v_intake.contact_match_state,
      'lead_link_state', v_intake.lead_link_state,
      'correlation_id', v_request_id
    )
  );

  if p_external_source_system is not null then
    insert into public.integration_links(
      workspace_id, source_system, external_entity_type, external_id,
      crm_entity_type, crm_entity_id, metadata
    ) values (
      v_intake.workspace_id,
      lower(trim(p_external_source_system)),
      lower(trim(p_external_entity_type)),
      trim(p_external_id),
      'intake_request',
      v_intake.id,
      jsonb_build_object('public_reference', v_intake.public_reference)
    );
  end if;

  return query
  select true, v_intake.public_reference, v_intake.submitted_at,
    v_intake.contact_match_state, v_intake.lead_link_state;
end;
$$;

revoke all on function public.submit_intake_bridge(
  text,text,text,text,text,text,jsonb,text,text,text,text
) from public, anon, authenticated;

grant execute on function public.submit_intake_bridge(
  text,text,text,text,text,text,jsonb,text,text,text,text
) to service_role;
