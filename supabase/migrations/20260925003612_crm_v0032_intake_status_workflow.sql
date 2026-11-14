-- CRM Core v0.03.2 — DP-CRM-020 Intake Status Workflow
-- Enforces versioned transitions, append-only history and selective status notification events.

-- Status configuration must go through controlled operations, not direct Data API writes.
revoke insert, update on public.intake_statuses from authenticated;
grant select on public.intake_statuses to authenticated;
grant select, insert, update on public.intake_statuses to service_role;

create or replace function private.assert_intake_status_manager(
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns public.workspace_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.workspace_role;
begin
  select wm.role
  into v_role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_actor_user_id
    and wm.status = 'active';

  if not found or v_role not in ('owner','admin','manager') then
    raise exception 'intake_status_configuration_not_authorized' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

revoke all on function private.assert_intake_status_manager(uuid,uuid)
from public, anon, authenticated;
grant execute on function private.assert_intake_status_manager(uuid,uuid)
to service_role;

create or replace function public.create_intake_status_config_service(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_key text,
  p_label text,
  p_position integer,
  p_is_terminal boolean,
  p_customer_notification_enabled boolean,
  p_active boolean,
  p_inbox_bucket text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.assert_intake_status_manager(p_workspace_id, p_actor_user_id);

  if p_is_terminal and p_inbox_bucket <> 'closed' then
    raise exception 'terminal_status_must_use_closed_bucket' using errcode = '23514';
  end if;

  insert into public.intake_statuses(
    workspace_id,
    key,
    label,
    position,
    is_initial,
    is_terminal,
    customer_notification_enabled,
    active,
    inbox_bucket
  ) values (
    p_workspace_id,
    lower(trim(p_key)),
    trim(p_label),
    p_position,
    false,
    p_is_terminal,
    p_customer_notification_enabled,
    p_active,
    p_inbox_bucket
  )
  returning id into v_id;

  insert into public.audit_logs(
    workspace_id,user_id,action,resource_type,resource_id,before_data,after_data
  ) values (
    p_workspace_id,
    p_actor_user_id,
    'intake_status.created',
    'intake_status',
    v_id,
    null,
    jsonb_build_object(
      'key', lower(trim(p_key)),
      'label', trim(p_label),
      'position', p_position,
      'is_terminal', p_is_terminal,
      'customer_notification_enabled', p_customer_notification_enabled,
      'active', p_active,
      'inbox_bucket', p_inbox_bucket
    )
  );

  return v_id;
end;
$$;

revoke all on function public.create_intake_status_config_service(
  uuid,uuid,text,text,integer,boolean,boolean,boolean,text
) from public, anon, authenticated;
grant execute on function public.create_intake_status_config_service(
  uuid,uuid,text,text,integer,boolean,boolean,boolean,text
) to service_role;

create or replace function public.update_intake_status_config_service(
  p_workspace_id uuid,
  p_status_id uuid,
  p_actor_user_id uuid,
  p_label text,
  p_position integer,
  p_is_terminal boolean,
  p_customer_notification_enabled boolean,
  p_active boolean,
  p_inbox_bucket text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.intake_statuses%rowtype;
  v_after public.intake_statuses%rowtype;
begin
  perform private.assert_intake_status_manager(p_workspace_id, p_actor_user_id);

  select *
  into v_before
  from public.intake_statuses
  where workspace_id = p_workspace_id
    and id = p_status_id
  for update;

  if not found then
    raise exception 'intake_status_not_found' using errcode = 'P0002';
  end if;

  if v_before.is_initial and (not p_active or p_is_terminal) then
    raise exception 'initial_status_must_remain_active_nonterminal' using errcode = '23514';
  end if;

  if p_is_terminal and p_inbox_bucket <> 'closed' then
    raise exception 'terminal_status_must_use_closed_bucket' using errcode = '23514';
  end if;

  update public.intake_statuses
  set label = trim(p_label),
      position = p_position,
      is_terminal = p_is_terminal,
      customer_notification_enabled = p_customer_notification_enabled,
      active = p_active,
      inbox_bucket = p_inbox_bucket
  where workspace_id = p_workspace_id
    and id = p_status_id
  returning * into v_after;

  insert into public.audit_logs(
    workspace_id,user_id,action,resource_type,resource_id,before_data,after_data
  ) values (
    p_workspace_id,
    p_actor_user_id,
    'intake_status.updated',
    'intake_status',
    p_status_id,
    jsonb_build_object(
      'label', v_before.label,
      'position', v_before.position,
      'is_terminal', v_before.is_terminal,
      'customer_notification_enabled', v_before.customer_notification_enabled,
      'active', v_before.active,
      'inbox_bucket', v_before.inbox_bucket
    ),
    jsonb_build_object(
      'label', v_after.label,
      'position', v_after.position,
      'is_terminal', v_after.is_terminal,
      'customer_notification_enabled', v_after.customer_notification_enabled,
      'active', v_after.active,
      'inbox_bucket', v_after.inbox_bucket
    )
  );

  return p_status_id;
end;
$$;

revoke all on function public.update_intake_status_config_service(
  uuid,uuid,uuid,text,integer,boolean,boolean,boolean,text
) from public, anon, authenticated;
grant execute on function public.update_intake_status_config_service(
  uuid,uuid,uuid,text,integer,boolean,boolean,boolean,text
) to service_role;

create or replace function public.set_initial_intake_status_service(
  p_workspace_id uuid,
  p_status_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.intake_statuses%rowtype;
  v_previous_id uuid;
begin
  perform private.assert_intake_status_manager(p_workspace_id, p_actor_user_id);

  -- Serialize the whole workspace status configuration.
  perform 1
  from public.intake_statuses
  where workspace_id = p_workspace_id
  for update;

  select *
  into v_target
  from public.intake_statuses
  where workspace_id = p_workspace_id
    and id = p_status_id;

  if not found then
    raise exception 'intake_status_not_found' using errcode = 'P0002';
  end if;

  if not v_target.active or v_target.is_terminal then
    raise exception 'initial_status_must_be_active_nonterminal' using errcode = '23514';
  end if;

  select id
  into v_previous_id
  from public.intake_statuses
  where workspace_id = p_workspace_id
    and is_initial
    and active
  limit 1;

  if v_previous_id = p_status_id then
    return p_status_id;
  end if;

  update public.intake_statuses
  set is_initial = false
  where workspace_id = p_workspace_id
    and is_initial;

  update public.intake_statuses
  set is_initial = true
  where workspace_id = p_workspace_id
    and id = p_status_id;

  insert into public.audit_logs(
    workspace_id,user_id,action,resource_type,resource_id,before_data,after_data
  ) values (
    p_workspace_id,
    p_actor_user_id,
    'intake_status.initial_changed',
    'intake_status',
    p_status_id,
    jsonb_build_object('previous_status_id', v_previous_id),
    jsonb_build_object('initial_status_id', p_status_id)
  );

  return p_status_id;
end;
$$;

revoke all on function public.set_initial_intake_status_service(uuid,uuid,uuid)
from public, anon, authenticated;
grant execute on function public.set_initial_intake_status_service(uuid,uuid,uuid)
to service_role;

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
  v_history public.intake_status_history%rowtype;
  v_role public.workspace_role;
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

  -- Replay is resolved before optimistic-version validation.
  select *
  into v_history
  from public.intake_status_history
  where workspace_id = p_workspace_id
    and intake_request_id = p_intake_id
    and request_id = v_request_id
  limit 1;

  if found then
    if v_history.to_status_id <> p_target_status_id
       or v_history.actor_user_id is distinct from p_actor_user_id then
      raise exception 'status_request_id_conflict' using errcode = '23505';
    end if;

    return query
    select
      true,
      true,
      v_history.resulting_version,
      v_history.id,
      v_history.to_status_id,
      v_history.to_status_key,
      v_history.to_status_label,
      v_history.customer_notification_enabled_snapshot;
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

create or replace function public.materialize_intake_status_changed_notification(
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.outbox_events%rowtype;
  v_intake public.intake_requests%rowtype;
  v_history public.intake_status_history%rowtype;
  v_settings public.notification_settings%rowtype;
  v_template text;
  v_template_version text;
  v_delivery_key text;
  v_history_id uuid;
  v_row_count integer := 0;
begin
  select *
  into v_event
  from public.outbox_events
  where id = p_event_id
  for update;

  if not found
     or v_event.event_type <> 'intake.status_changed'
     or v_event.aggregate_type <> 'intake_request' then
    return 0;
  end if;

  if v_event.processed_at is not null then
    return 0;
  end if;

  begin
    v_history_id := nullif(v_event.payload ->> 'history_id', '')::uuid;
  exception when others then
    v_history_id := null;
  end;

  if v_history_id is null then
    update public.outbox_events
    set last_error = 'status_notification_history_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  select *
  into v_intake
  from public.intake_requests
  where workspace_id = v_event.workspace_id
    and id = v_event.aggregate_id;

  select *
  into v_history
  from public.intake_status_history
  where workspace_id = v_event.workspace_id
    and intake_request_id = v_event.aggregate_id
    and id = v_history_id;

  if v_intake.id is null or v_history.id is null then
    update public.outbox_events
    set last_error = 'status_notification_entity_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  select *
  into v_settings
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

  if not v_history.customer_notification_enabled_snapshot
     or not v_settings.status_notifications_enabled then
    update public.outbox_events
    set processed_at = now(),
        last_error = 'status_notification_suppressed_by_configuration'
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

  v_template := nullif(v_settings.template_map ->> 'status_update', '');
  if v_template is null then
    update public.outbox_events
    set last_error = 'status_notification_template_missing',
        attempts = attempts + 1,
        available_at = now() + interval '5 minutes'
    where id = v_event.id;
    return 0;
  end if;

  v_template_version := coalesce(v_settings.template_map ->> 'template_version', 'v1');
  v_delivery_key := encode(
    extensions.digest(
      v_event.workspace_id::text || ':' || v_event.id::text ||
      ':customer_status:' || lower(v_intake.customer_email) || ':email',
      'sha256'
    ),
    'hex'
  );

  insert into public.notification_deliveries(
    workspace_id,
    intake_request_id,
    outbox_event_id,
    event_type,
    intent_key,
    recipient,
    template_key,
    template_variables,
    from_snapshot,
    reply_to_snapshot,
    provider,
    delivery_key,
    template_version,
    configuration_version
  ) values (
    v_event.workspace_id,
    v_intake.id,
    v_event.id,
    v_event.event_type,
    'customer_status',
    lower(v_intake.customer_email),
    v_template,
    jsonb_build_object(
      'CUSTOMER_NAME', v_intake.customer_name,
      'REFERENCE', v_intake.public_reference,
      'STATUS_LABEL', v_history.to_status_label
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

  update public.outbox_events
  set processed_at = now(),
      last_error = null
  where id = v_event.id;

  return v_row_count;
end;
$$;

revoke all on function public.materialize_intake_status_changed_notification(uuid)
from public, anon, authenticated;
grant execute on function public.materialize_intake_status_changed_notification(uuid)
to service_role;

create or replace function public.materialize_notification_batch(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_type text;
  v_count integer := 0;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_materialization_limit' using errcode = '22023';
  end if;

  for v_event_id, v_event_type in
    select id, event_type
    from public.outbox_events
    where processed_at is null
      and available_at <= now()
      and event_type in ('intake.created','intake.status_changed')
      and aggregate_type = 'intake_request'
    order by created_at, id
    limit p_limit
  loop
    begin
      if v_event_type = 'intake.created' then
        perform public.materialize_intake_created_notifications(v_event_id);
      elsif v_event_type = 'intake.status_changed' then
        perform public.materialize_intake_status_changed_notification(v_event_id);
      end if;
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
grant execute on function public.materialize_notification_batch(integer)
to service_role;

-- Planning source requires notification flags to start disabled until text/rules are approved.
update public.intake_statuses s
set customer_notification_enabled = false
from public.workspaces w
where s.workspace_id = w.id
  and w.slug in ('classy','fernandes')
  and s.customer_notification_enabled;
