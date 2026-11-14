-- CLASSY Connect v0.2 — receive-only conversation inbox.
-- Apply ONLY after 20261114160000_crm_connect_meta_ingress.sql in staging.
-- No provider credentials, outbound delivery, or CRM contact auto-matching.

create table public.connect_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null,
  provider text not null check (provider in ('instagram','messenger','whatsapp')),
  external_participant_id text not null check (char_length(external_participant_id) between 1 and 200),
  participant_display_name text,
  contact_id uuid,
  lead_id uuid,
  assigned_to uuid,
  status text not null default 'open' check (status in ('open','pending','closed')),
  row_version integer not null default 1 check (row_version > 0),
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connect_conversations_workspace_id_id_key unique (workspace_id, id),
  constraint connect_conversations_workspace_id_id_channel_key unique (workspace_id, id, channel_id),
  constraint connect_conversations_channel_participant_key unique (channel_id, external_participant_id),
  constraint connect_conversations_channel_fkey
    foreign key (workspace_id, channel_id)
    references public.connect_channels(workspace_id, id) on delete cascade,
  constraint connect_conversations_contact_fkey
    foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id),
  constraint connect_conversations_lead_fkey
    foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  constraint connect_conversations_assignee_fkey
    foreign key (workspace_id, assigned_to)
    references public.workspace_members(workspace_id, user_id),
  constraint connect_conversations_display_name_check
    check (participant_display_name is null or char_length(participant_display_name) <= 180),
  constraint connect_conversations_preview_check
    check (last_message_preview is null or char_length(last_message_preview) <= 180)
);

create table public.connect_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null,
  conversation_id uuid not null,
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 250),
  direction text not null default 'inbound' check (direction = 'inbound'),
  message_type text not null default 'text' check (message_type in ('text','media')),
  body text not null check (char_length(body) between 1 and 4000),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint connect_messages_channel_key unique (channel_id, provider_message_id),
  constraint connect_messages_conversation_fkey
    foreign key (workspace_id, conversation_id, channel_id)
    references public.connect_conversations(workspace_id, id, channel_id) on delete cascade,
  constraint connect_messages_channel_fkey
    foreign key (workspace_id, channel_id)
    references public.connect_channels(workspace_id, id) on delete cascade
);

create index idx_connect_conversations_inbox
  on public.connect_conversations(workspace_id, status, last_message_at desc nulls last, id);
create index idx_connect_conversations_assignee
  on public.connect_conversations(workspace_id, assigned_to, last_message_at desc);
create index idx_connect_messages_timeline
  on public.connect_messages(workspace_id, conversation_id, occurred_at, id);

create trigger trg_connect_conversations_updated_at
before update on public.connect_conversations
for each row execute function public.set_updated_at();

-- Assignment only through active, non-viewer workspace memberships.
-- Require an exact +1 revision for any changed assignee.
create or replace function private.connect_validate_conversation_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and wm.user_id = new.assigned_to
      and wm.status::text = 'active'
      and wm.role::text in ('owner','admin','manager','sales','marketing','support')
  ) then
    raise exception 'connect_assignee_unavailable' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.assigned_to is distinct from old.assigned_to
       or new.status is distinct from old.status
       or new.contact_id is distinct from old.contact_id then
      if new.row_version <> old.row_version + 1 then
        raise exception 'connect_revision_invalid' using errcode = '23514';
      end if;
    elsif new.row_version <> old.row_version then
      raise exception 'connect_revision_invalid' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_connect_conversations_assignee
before insert or update on public.connect_conversations
for each row execute function private.connect_validate_conversation_assignment();

revoke all on function private.connect_validate_conversation_assignment() from public, anon, authenticated;

alter table public.connect_conversations enable row level security;
alter table public.connect_messages enable row level security;

revoke all on public.connect_conversations, public.connect_messages
  from public, anon, authenticated;

grant all on public.connect_conversations, public.connect_messages to service_role;
grant select on public.connect_conversations, public.connect_messages to authenticated;
grant update (assigned_to, row_version, status, contact_id) on public.connect_conversations to authenticated;

create policy connect_conversations_select on public.connect_conversations
  for select to authenticated
  using (private.is_workspace_member(workspace_id)
    and private.current_workspace_role(workspace_id)::text
      in ('owner','admin','manager','sales','marketing','support'));

create policy connect_conversations_assign on public.connect_conversations
  for update to authenticated
  using (
    private.is_workspace_member(workspace_id)
    and (
      private.current_workspace_role(workspace_id)::text in ('owner','admin','manager')
      or (
        private.current_workspace_role(workspace_id)::text in ('sales','marketing','support')
        and (assigned_to is null or assigned_to = (select auth.uid()))
      )
    )
  )
  with check (
    private.is_workspace_member(workspace_id)
    and (
      private.current_workspace_role(workspace_id)::text in ('owner','admin','manager')
      or (
        private.current_workspace_role(workspace_id)::text in ('sales','marketing','support')
        and (assigned_to is null or assigned_to = (select auth.uid()))
      )
    )
  );

create policy connect_messages_select on public.connect_messages
  for select to authenticated
  using (private.is_workspace_member(workspace_id)
    and private.current_workspace_role(workspace_id)::text
      in ('owner','admin','manager','sales','marketing','support'));

-- Minimal audit of human workflow changes; no message bodies, handles or contact PII.
create table public.connect_conversation_control_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  actor_user_id uuid,
  previous_assigned_to uuid,
  assigned_to uuid,
  previous_status text,
  status text,
  previous_contact_id uuid,
  contact_id uuid,
  changed_at timestamptz not null default now(),
  constraint connect_conversation_control_audit_conversation_fkey
    foreign key (workspace_id, conversation_id)
    references public.connect_conversations(workspace_id, id) on delete cascade
);
create index idx_connect_conversation_control_audit
  on public.connect_conversation_control_audit(workspace_id, conversation_id, changed_at desc);
alter table public.connect_conversation_control_audit enable row level security;
revoke all on public.connect_conversation_control_audit from public, anon, authenticated;
grant all on public.connect_conversation_control_audit to service_role;
grant select on public.connect_conversation_control_audit to authenticated;
create policy connect_control_audit_manager_select
  on public.connect_conversation_control_audit for select to authenticated
  using (private.current_workspace_role(workspace_id)::text in ('owner','admin','manager'));

create or replace function private.connect_audit_control_changes()
returns trigger language plpgsql security definer set search_path = ''
as $connect_audit$
begin
  if old.assigned_to is distinct from new.assigned_to
     or old.status is distinct from new.status
     or old.contact_id is distinct from new.contact_id then
    insert into public.connect_conversation_control_audit (
      workspace_id, conversation_id, actor_user_id,
      previous_assigned_to, assigned_to,
      previous_status, status,
      previous_contact_id, contact_id
    ) values (
      new.workspace_id, new.id, auth.uid(),
      old.assigned_to, new.assigned_to,
      old.status, new.status,
      old.contact_id, new.contact_id
    );
  end if;
  return new;
end;
$connect_audit$;
revoke all on function private.connect_audit_control_changes() from public, anon, authenticated;
create trigger trg_connect_conversation_control_audit
  after update on public.connect_conversations
  for each row execute function private.connect_audit_control_changes();

-- Event queue leases. Enforce bounded retries and protect against stale acknowledgments.
alter table public.connect_webhook_events
  add column claim_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz,
  add column last_error_code text;

create or replace function public.claim_connect_events(p_limit integer default 10)
returns table (
  event_id uuid, claim_id uuid, provider text, event_kind text,
  payload jsonb
)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'invalid_claim_limit' using errcode = '22023';
  end if;
  return query
    with picked as (
      select e.id
      from public.connect_webhook_events e
      where (
        e.status in ('queued','failed')
        or (e.status = 'processing' and e.lease_expires_at < now())
      )
      and e.attempt_count < 5
      and (e.next_attempt_at is null or e.next_attempt_at <= now())
      order by e.received_at, e.id
      limit p_limit
      for update skip locked
    ), claimed as (
      update public.connect_webhook_events e
         set status = 'processing',
             attempt_count = e.attempt_count + 1,
             claim_token = gen_random_uuid(),
             lease_expires_at = now() + interval '2 minutes',
             next_attempt_at = null
      from picked p
      where e.id = p.id
      returning e.id, e.claim_token, e.channel_id, e.event_kind, e.payload
    )
    select c.id, c.claim_token, ch.provider, c.event_kind, c.payload
      from claimed c
      join public.connect_channels ch on ch.id = c.channel_id;
end;
$$;

create or replace function public.finish_connect_event(
  p_event_id uuid, p_claim_id uuid, p_success boolean, p_error_code text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_changed integer;
begin
  if p_success is null then raise exception 'invalid_result'; end if;
  -- Clear raw webhook contents on successful acknowledgement: the message
  -- is already persisted in its tenant-scoped table, while the event hash
  -- remains for replay deduplication. Failed events retain payload for retry.
  update public.connect_webhook_events e
    set status = case when p_success then 'processed' else 'failed' end,
        payload = case when p_success then '{}'::jsonb else e.payload end,
        processed_at = case when p_success then now() else null end,
        last_error_code = case when p_success then null else left(coalesce(p_error_code,'processing_failed'),80) end,
        next_attempt_at = case when p_success or e.attempt_count >= 5
          then null else now() + (power(2, least(e.attempt_count,5))::integer * interval '1 minute') end,
        claim_token = null,
        lease_expires_at = null
   where e.id = p_event_id and e.claim_token = p_claim_id and e.status = 'processing';
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

-- A single transactional insertion handles replay safely and derives tenant
-- exclusively from a signed event already stored in the private ingress queue.
create or replace function public.record_connect_inbound_message(
  p_event_id uuid,
  p_participant_id text,
  p_message_id text,
  p_body text,
  p_message_type text,
  p_occurred_at timestamptz,
  p_display_name text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_event record;
  v_conversation_id uuid;
  v_inserted uuid;
  v_time timestamptz;
begin
  if p_participant_id is null or char_length(p_participant_id) not between 1 and 200
    or p_message_id is null or char_length(p_message_id) not between 1 and 250
    or p_body is null or char_length(p_body) not between 1 and 4000
    or p_message_type not in ('text','media')
    or (p_display_name is not null and char_length(p_display_name) > 180) then
    raise exception 'connect_invalid_inbound_message' using errcode = '22023';
  end if;

  select e.workspace_id, e.channel_id, c.provider
    into v_event
    from public.connect_webhook_events e
    join public.connect_channels c on c.id = e.channel_id
   where e.id = p_event_id and e.status = 'processing' and c.active = true;
  if not found then raise exception 'connect_event_unavailable' using errcode = 'P0002'; end if;

  v_time := coalesce(p_occurred_at, now());

  insert into public.connect_conversations
    (workspace_id, channel_id, provider, external_participant_id, participant_display_name)
  values
    (v_event.workspace_id, v_event.channel_id, v_event.provider,
      p_participant_id, left(nullif(p_display_name,''),180))
  on conflict (channel_id, external_participant_id)
    do update set
      participant_display_name = coalesce(
        nullif(excluded.participant_display_name,''),
        connect_conversations.participant_display_name
      )
  returning id into v_conversation_id;

  insert into public.connect_messages
    (workspace_id, channel_id, conversation_id, provider_message_id,
      message_type, body, occurred_at)
  values
    (v_event.workspace_id, v_event.channel_id, v_conversation_id, p_message_id,
      p_message_type, p_body, v_time)
  on conflict (channel_id, provider_message_id) do nothing
  returning id into v_inserted;

  if v_inserted is not null then
    update public.connect_conversations
       set last_message_at = v_time,
           last_message_preview = left(p_body,180),
           status = 'open',
           row_version = case
             when status <> 'open' then row_version + 1
             else row_version
           end
     where id = v_conversation_id
       and (last_message_at is null or last_message_at <= v_time);
  end if;

  return v_inserted is not null;
end;
$$;

revoke all on function public.claim_connect_events(integer) from public, anon, authenticated;
revoke all on function public.finish_connect_event(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.record_connect_inbound_message(uuid,text,text,text,text,timestamptz,text)
  from public, anon, authenticated;

grant execute on function public.claim_connect_events(integer) to service_role;
grant execute on function public.finish_connect_event(uuid,uuid,boolean,text) to service_role;
grant execute on function public.record_connect_inbound_message(uuid,text,text,text,text,timestamptz,text) to service_role;
