-- CRM Core v0.03.2 — DP-CRM-020 exact command idempotency and activity projection
-- Additive correction after 20260925003612. Do not rewrite applied migrations.

create table public.intake_status_commands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  intake_request_id uuid not null,
  request_id text not null,
  command_hash text not null,
  actor_user_id uuid not null references auth.users(id),
  target_status_id uuid not null,
  expected_version integer not null,
  change_source text not null,
  changed boolean not null,
  resulting_version integer not null,
  history_id uuid references public.intake_status_history(id) on delete restrict,
  status_id uuid not null,
  status_key text not null,
  status_label text not null,
  customer_notification_enabled_snapshot boolean not null default false,
  created_at timestamptz not null default now(),
  constraint intake_status_commands_request_key
    unique (workspace_id, intake_request_id, request_id),
  constraint intake_status_commands_hash_check
    check (command_hash ~ '^[a-f0-9]{64}$'),
  constraint intake_status_commands_expected_version_check
    check (expected_version > 0),
  constraint intake_status_commands_resulting_version_check
    check (resulting_version > 0),
  constraint intake_status_commands_workspace_intake_fkey
    foreign key (workspace_id, intake_request_id)
    references public.intake_requests(workspace_id, id) on delete cascade,
  constraint intake_status_commands_workspace_target_fkey
    foreign key (workspace_id, target_status_id)
    references public.intake_statuses(workspace_id, id) on delete restrict,
  constraint intake_status_commands_workspace_status_fkey
    foreign key (workspace_id, status_id)
    references public.intake_statuses(workspace_id, id) on delete restrict
);

create index idx_intake_status_commands_intake
  on public.intake_status_commands(workspace_id, intake_request_id, created_at desc);

alter table public.intake_status_commands enable row level security;

revoke all on public.intake_status_commands from public, anon, authenticated;
grant all on public.intake_status_commands to service_role;

create or replace function public.transition_intake_status_service(
  p_workspace_id uuid,
  p_intake_id uuid,
  p_target_status_id uuid,
  p_expected_version integer,
  p_request_id text,
  p_comment text,
  p_actor_user_id uuid,
  p_change_source text default 'ui'
)
returns table (
  changed boolean,
  replayed boolean,
  row_version integer,
  history_id uuid,
  status_id uuid,
  status_key text,
  status_label text,
  customer_notification_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intake public.intake_requests%rowtype;
  v_current public.intake_statuses%rowtype;
  v_target public.intake_statuses%rowtype;
  v_role public.workspace_role;
  v_command public.intake_status_commands%rowtype;
  v_command_hash text;
  v_new_version integer;
  v_history_id uuid;
  v_comment text := nullif(trim(p_comment), '');
  v_request_id text := trim(p_request_id);
begin
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'invalid_expected_version' using errcode = '22023';
  end if;

  if v_request_id = '' or char_length(v_request_id) > 200 then
    raise exception 'invalid_status_request_id' using errcode = '22023';
  end if;

  if v_comment is not null and char_length(v_comment) > 2000 then
    raise exception 'status_comment_too_long' using errcode = '22023';
  end if;

  if p_change_source not in ('ui','api_internal') then
    raise exception 'invalid_status_change_source' using errcode = '22023';
  end if;

  select wm.role
  into v_role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_actor_user_id
    and wm.status = 'active';

  if not found or v_role = 'viewer' then
    raise exception 'intake_status_change_not_authorized' using errcode = '42501';
  end if;

  v_command_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'target_status_id', p_target_status_id,
        'expected_version', p_expected_version,
        'actor_user_id', p_actor_user_id,
        'comment', v_comment,
        'change_source', p_change_source
      )::text,
      'sha256'
    ),
    'hex'
  );

  -- Serialize all attempts sharing one request_id, including noops.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_workspace_id::text || ':' || p_intake_id::text || ':' || v_request_id,
      0
    )
  );

  select *
  into v_command
  from public.intake_status_commands
  where workspace_id = p_workspace_id
    and intake_request_id = p_intake_id
    and request_id = v_request_id
  limit 1;

  if found then
    if v_command.command_hash <> v_command_hash then
      raise exception 'status_request_id_conflict' using errcode = '23505';
    end if;

    return query
    select
      v_command.changed,
      true,
      v_command.resulting_version,
      v_command.history_id,
      v_command.status_id,
      v_command.status_key,
      v_command.status_label,
      v_command.customer_notification_enabled_snapshot;
    return;
  end if;

  select *
  into v_intake
  from public.intake_requests
  where workspace_id = p_workspace_id
    and id = p_intake_id
  for update;

  if not found then
    raise exception 'intake_not_found' using errcode = 'P0002';
  end if;

  if v_intake.row_version <> p_expected_version then
    raise exception 'intake_version_conflict' using errcode = '40001';
  end if;

  select *
  into v_current
  from public.intake_statuses
  where workspace_id = p_workspace_id
    and id = v_intake.status_id;

  if not found then
    raise exception 'current_intake_status_missing' using errcode = '23503';
  end if;

  select *
  into v_target
  from public.intake_statuses
  where workspace_id = p_workspace_id
    and id = p_target_status_id
    and active;

  if not found then
    raise exception 'target_intake_status_unavailable' using errcode = 'P0002';
  end if;

  if v_current.id = v_target.id then
    insert into public.intake_status_commands(
      workspace_id,
      intake_request_id,
      request_id,
      command_hash,
      actor_user_id,
      target_status_id,
      expected_version,
      change_source,
      changed,
      resulting_version,
      history_id,
      status_id,
      status_key,
      status_label,
      customer_notification_enabled_snapshot
    ) values (
      p_workspace_id,
      p_intake_id,
      v_request_id,
      v_command_hash,
      p_actor_user_id,
      p_target_status_id,
      p_expected_version,
      p_change_source,
      false,
      v_intake.row_version,
      null,
      v_current.id,
      v_current.key,
      v_current.label,
      v_current.customer_notification_enabled
    );

    return query
    select
      false,
      false,
      v_intake.row_version,
      null::uuid,
      v_current.id,
      v_current.key,
      v_current.label,
      v_current.customer_notification_enabled;
    return;
  end if;

  if v_current.is_terminal and not v_target.is_terminal then
    if v_role not in ('owner','admin','manager') then
      raise exception 'terminal_reopen_not_authorized' using errcode = '42501';
    end if;
    if v_comment is null or char_length(v_comment) < 3 then
      raise exception 'terminal_reopen_reason_required' using errcode = '23514';
    end if;
  end if;

  v_new_version := v_intake.row_version + 1;

  update public.intake_requests
  set status_id = v_target.id,
      row_version = v_new_version
  where workspace_id = p_workspace_id
    and id = p_intake_id;

  insert into public.intake_status_history(
    workspace_id,
    intake_request_id,
    from_status_id,
    to_status_id,
    from_status_key,
    from_status_label,
    to_status_key,
    to_status_label,
    actor_user_id,
    actor_type,
    changed_at,
    comment,
    change_source,
    request_id,
    resulting_version,
    customer_notification_enabled_snapshot
  ) values (
    p_workspace_id,
    p_intake_id,
    v_current.id,
    v_target.id,
    v_current.key,
    v_current.label,
    v_target.key,
    v_target.label,
    p_actor_user_id,
    'user',
    now(),
    v_comment,
    p_change_source,
    v_request_id,
    v_new_version,
    v_target.customer_notification_enabled
  )
  returning id into v_history_id;

  insert into public.activities(
    workspace_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_workspace_id,
    p_actor_user_id,
    'intake.status_changed',
    'intake_request',
    p_intake_id,
    jsonb_build_object(
      'history_id', v_history_id,
      'from_status_key', v_current.key,
      'from_status_label', v_current.label,
      'to_status_key', v_target.key,
      'to_status_label', v_target.label,
      'resulting_version', v_new_version,
      'change_source', p_change_source
    )
  );

  insert into public.outbox_events(
    workspace_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    p_workspace_id,
    'intake.status_changed',
    'intake_request',
    p_intake_id,
    jsonb_build_object(
      'history_id', v_history_id,
      'public_reference', v_intake.public_reference,
      'from_status_key', v_current.key,
      'to_status_key', v_target.key,
      'to_status_label', v_target.label,
      'customer_notification_enabled', v_target.customer_notification_enabled,
      'row_version', v_new_version
    )
  );

  insert into public.intake_status_commands(
    workspace_id,
    intake_request_id,
    request_id,
    command_hash,
    actor_user_id,
    target_status_id,
    expected_version,
    change_source,
    changed,
    resulting_version,
    history_id,
    status_id,
    status_key,
    status_label,
    customer_notification_enabled_snapshot
  ) values (
    p_workspace_id,
    p_intake_id,
    v_request_id,
    v_command_hash,
    p_actor_user_id,
    p_target_status_id,
    p_expected_version,
    p_change_source,
    true,
    v_new_version,
    v_history_id,
    v_target.id,
    v_target.key,
    v_target.label,
    v_target.customer_notification_enabled
  );

  return query
  select
    true,
    false,
    v_new_version,
    v_history_id,
    v_target.id,
    v_target.key,
    v_target.label,
    v_target.customer_notification_enabled;
end;
$$;

revoke all on function public.transition_intake_status_service(
  uuid,uuid,uuid,integer,text,text,uuid,text
) from public, anon, authenticated;
grant execute on function public.transition_intake_status_service(
  uuid,uuid,uuid,integer,text,text,uuid,text
) to service_role;
