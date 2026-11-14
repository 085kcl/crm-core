-- DP-CRM-020 focused idempotency/activity smoke test.
-- Entire fixture rolls back.

begin;

create temporary table _idem_fixture as
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
  encode(digest('idem-status-'||gen_random_uuid()::text,'sha256'),'hex') as request_hash,
  gen_random_uuid()::text as suffix
from public.workspaces w
where w.slug='classy';

create temporary table _idem_intake as
select *
from public.submit_intake_bridge(
  'classy-pre-analysis',
  (select idem_hash from _idem_fixture),
  (select request_hash from _idem_fixture),
  'Cliente Idempotency Smoke',
  'idem-status-'||(select suffix from _idem_fixture)||'@example.invalid',
  '+55 16 98888-0101',
  '{"renda_mensal":7200}'::jsonb,
  gen_random_uuid()::text,
  'classy_admin',
  'pre_analysis',
  'idem-status-'||(select suffix from _idem_fixture)
);

create temporary table _idem_ids as
select
  i.id as intake_id,
  (select id from public.intake_statuses where workspace_id=i.workspace_id and key='triage') as triage_id,
  (select id from public.intake_statuses where workspace_id=i.workspace_id and key='pre_analysis') as pre_analysis_id
from public.intake_requests i
where i.public_reference=(select public_reference from _idem_intake);

create temporary table _effective as
select *
from public.transition_intake_status_service(
  (select workspace_id from _idem_fixture),
  (select intake_id from _idem_ids),
  (select triage_id from _idem_ids),
  1,
  'idem-effective-request',
  'Comentário A',
  (select actor_id from _idem_fixture),
  'ui'
);

do $$
declare
  v record;
begin
  select * into v from _effective;
  if not v.changed or v.replayed or v.row_version <> 2 or v.history_id is null then
    raise exception 'unexpected effective transition result: %', row_to_json(v);
  end if;

  if (
    select count(*)
    from public.intake_status_commands
    where intake_request_id=(select intake_id from _idem_ids)
      and request_id='idem-effective-request'
  ) <> 1 then
    raise exception 'effective command row missing';
  end if;

  if (
    select count(*)
    from public.activities
    where workspace_id=(select workspace_id from _idem_fixture)
      and entity_type='intake_request'
      and entity_id=(select intake_id from _idem_ids)
      and type='intake.status_changed'
  ) <> 1 then
    raise exception 'activity projection missing or duplicated';
  end if;
end $$;

create temporary table _effective_replay as
select *
from public.transition_intake_status_service(
  (select workspace_id from _idem_fixture),
  (select intake_id from _idem_ids),
  (select triage_id from _idem_ids),
  1,
  'idem-effective-request',
  'Comentário A',
  (select actor_id from _idem_fixture),
  'ui'
);

do $$
begin
  if not (select replayed from _effective_replay)
     or not (select changed from _effective_replay)
     or (select row_version from _effective_replay) <> 2 then
    raise exception 'exact effective replay failed';
  end if;

  if (
    select count(*)
    from public.intake_status_history
    where intake_request_id=(select intake_id from _idem_ids)
      and request_id='idem-effective-request'
  ) <> 1 then
    raise exception 'effective replay duplicated history';
  end if;
end $$;

-- Same request_id and target/actor but a different comment is NOT an exact replay.
do $$
begin
  begin
    perform public.transition_intake_status_service(
      (select workspace_id from _idem_fixture),
      (select intake_id from _idem_ids),
      (select triage_id from _idem_ids),
      1,
      'idem-effective-request',
      'Comentário B',
      (select actor_id from _idem_fixture),
      'ui'
    );
    raise exception 'different comment unexpectedly replayed';
  exception when unique_violation then
    if sqlerrm not like '%status_request_id_conflict%' then raise; end if;
  end;
end $$;

-- expected_version is part of the original intent too.
do $$
begin
  begin
    perform public.transition_intake_status_service(
      (select workspace_id from _idem_fixture),
      (select intake_id from _idem_ids),
      (select triage_id from _idem_ids),
      2,
      'idem-effective-request',
      'Comentário A',
      (select actor_id from _idem_fixture),
      'ui'
    );
    raise exception 'different expected_version unexpectedly replayed';
  exception when unique_violation then
    if sqlerrm not like '%status_request_id_conflict%' then raise; end if;
  end;
end $$;

-- A noop is persisted as a command even though it creates no history/outbox/activity.
create temporary table _noop as
select *
from public.transition_intake_status_service(
  (select workspace_id from _idem_fixture),
  (select intake_id from _idem_ids),
  (select triage_id from _idem_ids),
  2,
  'idem-noop-request',
  null,
  (select actor_id from _idem_fixture),
  'ui'
);

do $$
begin
  if (select changed from _noop)
     or (select replayed from _noop)
     or (select row_version from _noop) <> 2
     or (select history_id from _noop) is not null then
    raise exception 'noop result invalid';
  end if;

  if not exists (
    select 1
    from public.intake_status_commands
    where intake_request_id=(select intake_id from _idem_ids)
      and request_id='idem-noop-request'
      and not changed
      and resulting_version=2
      and history_id is null
  ) then
    raise exception 'noop command was not persisted';
  end if;

  if exists (
    select 1
    from public.intake_status_history
    where intake_request_id=(select intake_id from _idem_ids)
      and request_id='idem-noop-request'
  ) then
    raise exception 'noop created history';
  end if;
end $$;

create temporary table _noop_replay as
select *
from public.transition_intake_status_service(
  (select workspace_id from _idem_fixture),
  (select intake_id from _idem_ids),
  (select triage_id from _idem_ids),
  2,
  'idem-noop-request',
  null,
  (select actor_id from _idem_fixture),
  'ui'
);

do $$
begin
  if not (select replayed from _noop_replay)
     or (select changed from _noop_replay)
     or (select row_version from _noop_replay) <> 2 then
    raise exception 'noop exact replay failed';
  end if;
end $$;

-- Advance the intake after the noop.
create temporary table _second_effective as
select *
from public.transition_intake_status_service(
  (select workspace_id from _idem_fixture),
  (select intake_id from _idem_ids),
  (select pre_analysis_id from _idem_ids),
  2,
  'idem-second-effective',
  null,
  (select actor_id from _idem_fixture),
  'ui'
);

-- The old noop request must still replay its original result, not be reinterpreted now.
create temporary table _old_noop_replay as
select *
from public.transition_intake_status_service(
  (select workspace_id from _idem_fixture),
  (select intake_id from _idem_ids),
  (select triage_id from _idem_ids),
  2,
  'idem-noop-request',
  null,
  (select actor_id from _idem_fixture),
  'ui'
);

do $$
begin
  if not (select replayed from _old_noop_replay)
     or (select changed from _old_noop_replay)
     or (select row_version from _old_noop_replay) <> 2 then
    raise exception 'historical noop replay changed meaning after later transition';
  end if;

  if (
    select count(*)
    from public.activities
    where workspace_id=(select workspace_id from _idem_fixture)
      and entity_type='intake_request'
      and entity_id=(select intake_id from _idem_ids)
      and type='intake.status_changed'
  ) <> 2 then
    raise exception 'effective transitions did not produce exactly two activities';
  end if;

  if (
    select count(*)
    from public.outbox_events
    where workspace_id=(select workspace_id from _idem_fixture)
      and aggregate_type='intake_request'
      and aggregate_id=(select intake_id from _idem_ids)
      and event_type='intake.status_changed'
  ) <> 2 then
    raise exception 'effective transitions did not produce exactly two status events';
  end if;
end $$;

-- Reusing the noop request_id with a new expected_version is a conflict, not a new command.
do $$
begin
  begin
    perform public.transition_intake_status_service(
      (select workspace_id from _idem_fixture),
      (select intake_id from _idem_ids),
      (select triage_id from _idem_ids),
      3,
      'idem-noop-request',
      null,
      (select actor_id from _idem_fixture),
      'ui'
    );
    raise exception 'noop request_id was reused with a different intent';
  exception when unique_violation then
    if sqlerrm not like '%status_request_id_conflict%' then raise; end if;
  end;
end $$;

-- Command ledger is internal only.
do $guard$
declare
  v_actor uuid := (select actor_id from _idem_fixture);
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  begin
    perform 1 from public.intake_status_commands limit 1;
    raise exception 'authenticated unexpectedly read internal status command ledger';
  exception when insufficient_privilege then null;
  end;

  reset role;
end $guard$;

rollback;
