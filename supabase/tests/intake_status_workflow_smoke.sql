-- DP-CRM-020 intake status workflow smoke test.
-- Entire fixture is rolled back.

begin;

create temporary table _status_fixture as
select
  w.id as workspace_id,
  (
    select wm.user_id
    from public.workspace_members wm
    where wm.workspace_id=w.id
      and wm.status='active'
      and wm.role in ('owner','admin','manager')
    order by case wm.role when 'owner' then 1 when 'admin' then 2 else 3 end
    limit 1
  ) as actor_id,
  encode(digest(gen_random_uuid()::text,'sha256'),'hex') as idem_hash,
  encode(digest('status-smoke-'||gen_random_uuid()::text,'sha256'),'hex') as request_hash,
  gen_random_uuid()::text as suffix
from public.workspaces w
where w.slug='classy';

do $$
begin
  if (select actor_id from _status_fixture) is null then
    raise exception 'no CLASSY status manager available';
  end if;
end $$;

-- Enable transport only inside this rolled-back fixture.
update public.notification_settings ns
set sender_email='atendimento@classyrp.com.br',
    status_notifications_enabled=true
where ns.workspace_id=(select workspace_id from _status_fixture);

-- Approve one target status only for this smoke test.
select public.update_intake_status_config_service(
  (select workspace_id from _status_fixture),
  (
    select id from public.intake_statuses
    where workspace_id=(select workspace_id from _status_fixture)
      and key='pre_analysis'
  ),
  (select actor_id from _status_fixture),
  'Em pré-análise',
  20,
  false,
  true,
  true,
  'in_progress'
);

create temporary table _status_intake as
select *
from public.submit_intake_bridge(
  'classy-pre-analysis',
  (select idem_hash from _status_fixture),
  (select request_hash from _status_fixture),
  'Cliente Status Smoke',
  'status-smoke-'||(select suffix from _status_fixture)||'@example.invalid',
  '+55 16 99999-4321',
  '{"renda_mensal":9100,"valor_imovel":450000}'::jsonb,
  gen_random_uuid()::text,
  'classy_admin',
  'pre_analysis',
  'status-legacy-'||(select suffix from _status_fixture)
);

create temporary table _status_ids as
select
  i.id as intake_id,
  i.status_id as received_id,
  (select id from public.intake_statuses where workspace_id=i.workspace_id and key='triage') as triage_id,
  (select id from public.intake_statuses where workspace_id=i.workspace_id and key='pre_analysis') as pre_analysis_id,
  (select id from public.intake_statuses where workspace_id=i.workspace_id and key='completed') as completed_id
from public.intake_requests i
where i.public_reference=(select public_reference from _status_intake);

-- First effective transition: received -> triage. Triage remains non-notifying.
create temporary table _transition_one as
select *
from public.transition_intake_status_service(
  (select workspace_id from _status_fixture),
  (select intake_id from _status_ids),
  (select triage_id from _status_ids),
  1,
  'status-smoke-request-1',
  'Comentário interno que nunca deve ir ao e-mail.',
  (select actor_id from _status_fixture),
  'ui'
);

do $$
declare
  v record;
  v_history_count integer;
  v_event_count integer;
begin
  select * into v from _transition_one;
  if not v.changed or v.replayed or v.row_version <> 2 then
    raise exception 'unexpected first transition result: %', row_to_json(v);
  end if;

  select count(*) into v_history_count
  from public.intake_status_history
  where intake_request_id=(select intake_id from _status_ids)
    and request_id='status-smoke-request-1';
  if v_history_count <> 1 then
    raise exception 'expected one status history row, got %', v_history_count;
  end if;

  select count(*) into v_event_count
  from public.outbox_events
  where aggregate_id=(select intake_id from _status_ids)
    and event_type='intake.status_changed'
    and payload->>'history_id'=v.history_id::text;
  if v_event_count <> 1 then
    raise exception 'expected one status outbox event, got %', v_event_count;
  end if;

  if exists (
    select 1
    from public.outbox_events
    where aggregate_id=(select intake_id from _status_ids)
      and event_type='intake.status_changed'
      and payload::text like '%Comentário interno%'
  ) then
    raise exception 'internal comment leaked into outbox payload';
  end if;
end $$;

-- Exact replay must return the same result without a second history/event.
create temporary table _transition_replay as
select *
from public.transition_intake_status_service(
  (select workspace_id from _status_fixture),
  (select intake_id from _status_ids),
  (select triage_id from _status_ids),
  1,
  'status-smoke-request-1',
  'Comentário interno que nunca deve ir ao e-mail.',
  (select actor_id from _status_fixture),
  'ui'
);

do $$
declare
  v record;
begin
  select * into v from _transition_replay;
  if not v.replayed or v.row_version <> 2 then
    raise exception 'replay was not recognized';
  end if;

  if (
    select count(*) from public.intake_status_history
    where intake_request_id=(select intake_id from _status_ids)
      and request_id='status-smoke-request-1'
  ) <> 1 then
    raise exception 'replay duplicated history';
  end if;
end $$;

-- Reusing request_id with a different target is a conflict.
do $$
begin
  begin
    perform public.transition_intake_status_service(
      (select workspace_id from _status_fixture),
      (select intake_id from _status_ids),
      (select pre_analysis_id from _status_ids),
      2,
      'status-smoke-request-1',
      null,
      (select actor_id from _status_fixture),
      'ui'
    );
    raise exception 'request_id conflict unexpectedly succeeded';
  exception when unique_violation then
    if sqlerrm not like '%status_request_id_conflict%' then raise; end if;
  end;
end $$;

-- Stale version must lose, never last-write-wins.
do $$
begin
  begin
    perform public.transition_intake_status_service(
      (select workspace_id from _status_fixture),
      (select intake_id from _status_ids),
      (select pre_analysis_id from _status_ids),
      1,
      'status-smoke-stale-version',
      null,
      (select actor_id from _status_fixture),
      'ui'
    );
    raise exception 'stale version unexpectedly succeeded';
  exception when serialization_failure then
    if sqlerrm not like '%intake_version_conflict%' then raise; end if;
  end;
end $$;

-- Same status with a fresh request is a noop and must not create history/outbox.
create temporary table _transition_noop as
select *
from public.transition_intake_status_service(
  (select workspace_id from _status_fixture),
  (select intake_id from _status_ids),
  (select triage_id from _status_ids),
  2,
  'status-smoke-noop',
  null,
  (select actor_id from _status_fixture),
  'ui'
);

do $$
declare
  v record;
begin
  select * into v from _transition_noop;
  if v.changed or v.replayed or v.row_version <> 2 or v.history_id is not null then
    raise exception 'same-status change was not a noop';
  end if;
  if exists (
    select 1 from public.intake_status_history
    where intake_request_id=(select intake_id from _status_ids)
      and request_id='status-smoke-noop'
  ) then
    raise exception 'noop created history';
  end if;
end $$;

-- Materialize non-notifying triage event: no delivery, event consumed as suppressed.
select public.materialize_notification_batch(20);

do $$
begin
  if exists (
    select 1 from public.notification_deliveries
    where intake_request_id=(select intake_id from _status_ids)
      and event_type='intake.status_changed'
  ) then
    raise exception 'non-notifying status created a delivery';
  end if;
end $$;

-- Move to an approved notifying status.
create temporary table _transition_notify as
select *
from public.transition_intake_status_service(
  (select workspace_id from _status_fixture),
  (select intake_id from _status_ids),
  (select pre_analysis_id from _status_ids),
  2,
  'status-smoke-request-2',
  'Este comentário continua exclusivamente interno.',
  (select actor_id from _status_fixture),
  'ui'
);

select public.materialize_notification_batch(20);

do $$
declare
  v_delivery_count integer;
begin
  select count(*) into v_delivery_count
  from public.notification_deliveries
  where intake_request_id=(select intake_id from _status_ids)
    and event_type='intake.status_changed'
    and intent_key='customer_status';

  if v_delivery_count <> 1 then
    raise exception 'expected exactly one status delivery, got %', v_delivery_count;
  end if;

  if exists (
    select 1
    from public.notification_deliveries
    where intake_request_id=(select intake_id from _status_ids)
      and event_type='intake.status_changed'
      and template_variables::text like '%comentário%'
  ) then
    raise exception 'internal status comment leaked into email variables';
  end if;

  if not exists (
    select 1
    from public.notification_deliveries
    where intake_request_id=(select intake_id from _status_ids)
      and intent_key='customer_status'
      and template_variables->>'STATUS_LABEL'='Em pré-análise'
  ) then
    raise exception 'status delivery did not freeze the target label';
  end if;
end $$;

-- Owner may enter terminal normally.
create temporary table _transition_terminal as
select *
from public.transition_intake_status_service(
  (select workspace_id from _status_fixture),
  (select intake_id from _status_ids),
  (select completed_id from _status_ids),
  3,
  'status-smoke-terminal',
  null,
  (select actor_id from _status_fixture),
  'ui'
);

-- Reopening terminal requires a reason even for owner/admin/manager.
do $$
begin
  begin
    perform public.transition_intake_status_service(
      (select workspace_id from _status_fixture),
      (select intake_id from _status_ids),
      (select triage_id from _status_ids),
      4,
      'status-smoke-reopen-missing-reason',
      null,
      (select actor_id from _status_fixture),
      'ui'
    );
    raise exception 'terminal reopen without reason unexpectedly succeeded';
  exception when check_violation then
    if sqlerrm not like '%terminal_reopen_reason_required%' then raise; end if;
  end;
end $$;

create temporary table _transition_reopen as
select *
from public.transition_intake_status_service(
  (select workspace_id from _status_fixture),
  (select intake_id from _status_ids),
  (select triage_id from _status_ids),
  4,
  'status-smoke-reopen',
  'Reabertura aprovada para complementar a análise.',
  (select actor_id from _status_fixture),
  'ui'
);

do $$
begin
  if (select row_version from _transition_reopen) <> 5 then
    raise exception 'reopen did not increment version';
  end if;
end $$;

-- Configuration path: create temporary status and atomically switch initial.
create temporary table _new_initial as
select public.create_intake_status_config_service(
  (select workspace_id from _status_fixture),
  (select actor_id from _status_fixture),
  'received_alt_smoke',
  'Recebida alternativa smoke',
  1,
  false,
  false,
  true,
  'new'
) as id;

select public.set_initial_intake_status_service(
  (select workspace_id from _status_fixture),
  (select id from _new_initial),
  (select actor_id from _status_fixture)
);

do $$
begin
  if (
    select count(*)
    from public.intake_statuses
    where workspace_id=(select workspace_id from _status_fixture)
      and active and is_initial
  ) <> 1 then
    raise exception 'workspace no longer has exactly one active initial status';
  end if;

  if not exists (
    select 1 from public.intake_statuses
    where id=(select id from _new_initial) and is_initial
  ) then
    raise exception 'new initial status was not activated';
  end if;
end $$;

-- Direct authenticated writes cannot bypass the controlled transition/configuration path.
do $smoke$
declare
  v_actor uuid := (select actor_id from _status_fixture);
  v_intake uuid := (select intake_id from _status_ids);
  v_triage uuid := (select triage_id from _status_ids);
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  begin
    update public.intake_requests
    set row_version=row_version+1
    where id=v_intake;
    raise exception 'authenticated direct intake update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.intake_statuses
    set label='Bypass'
    where id=v_triage;
    raise exception 'authenticated direct status config update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.intake_status_history
    set comment='tampered'
    where intake_request_id=v_intake;
    raise exception 'authenticated history update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  reset role;
end $smoke$;

rollback;
