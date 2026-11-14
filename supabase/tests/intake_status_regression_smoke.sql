-- DP-CRM-020 workflow regression matrix.
-- Entire fixture is rolled back.

begin;

create temporary table _wf_fixture as
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
  encode(digest('workflow-regression-'||gen_random_uuid()::text,'sha256'),'hex') as request_hash,
  gen_random_uuid()::text as suffix
from public.workspaces w
where w.slug='classy';

create temporary table _wf_intake as
select *
from public.submit_intake_bridge(
  'classy-pre-analysis',
  (select idem_hash from _wf_fixture),
  (select request_hash from _wf_fixture),
  'Cliente Workflow Regression',
  'workflow-reg-'||(select suffix from _wf_fixture)||'@example.invalid',
  '+55 16 97777-0101',
  '{"valor_imovel":390000}'::jsonb,
  gen_random_uuid()::text,
  'classy_admin',
  'pre_analysis',
  'workflow-reg-'||(select suffix from _wf_fixture)
);

create temporary table _wf_ids as
select
  i.id as intake_id,
  (select id from public.intake_statuses where workspace_id=i.workspace_id and key='triage') as triage_id,
  (select id from public.intake_statuses where workspace_id=i.workspace_id and key='pre_analysis') as pre_analysis_id,
  (select id from public.intake_statuses where workspace_id=i.workspace_id and key='awaiting_documents') as awaiting_documents_id
from public.intake_requests i
where i.public_reference=(select public_reference from _wf_intake);

-- Effective transition to triage creates the historical snapshot we will later protect.
create temporary table _wf_triage as
select *
from public.transition_intake_status_service(
  (select workspace_id from _wf_fixture),
  (select intake_id from _wf_ids),
  (select triage_id from _wf_ids),
  1,
  'workflow-reg-triage',
  null,
  (select actor_id from _wf_fixture),
  'ui'
);

-- Rename the current status through the controlled configuration path.
select public.update_intake_status_config_service(
  (select workspace_id from _wf_fixture),
  (select triage_id from _wf_ids),
  (select actor_id from _wf_fixture),
  'Em triagem renomeada (smoke)',
  10,
  false,
  false,
  true,
  'in_progress'
);

do $$
begin
  if (
    select to_status_label
    from public.intake_status_history
    where id=(select history_id from _wf_triage)
  ) <> 'Em triagem' then
    raise exception 'historical label snapshot changed after rename';
  end if;

  if (
    select label
    from public.intake_statuses
    where id=(select triage_id from _wf_ids)
  ) <> 'Em triagem renomeada (smoke)' then
    raise exception 'current status label was not renamed';
  end if;
end $$;

-- Create then inactivate a destination. Inactive status must reject new transitions.
create temporary table _wf_inactive as
select public.create_intake_status_config_service(
  (select workspace_id from _wf_fixture),
  (select actor_id from _wf_fixture),
  'inactive_smoke',
  'Inativo smoke',
  25,
  false,
  false,
  true,
  'in_progress'
) as id;

select public.update_intake_status_config_service(
  (select workspace_id from _wf_fixture),
  (select id from _wf_inactive),
  (select actor_id from _wf_fixture),
  'Inativo smoke',
  25,
  false,
  false,
  false,
  'in_progress'
);

do $$
begin
  begin
    perform public.transition_intake_status_service(
      (select workspace_id from _wf_fixture),
      (select intake_id from _wf_ids),
      (select id from _wf_inactive),
      2,
      'workflow-reg-inactive',
      null,
      (select actor_id from _wf_fixture),
      'ui'
    );
    raise exception 'inactive target unexpectedly accepted';
  exception when no_data_found then
    if sqlerrm not like '%target_intake_status_unavailable%' then raise; end if;
  end;
end $$;

-- A used status cannot be deleted even by the migration/test executor:
-- history/current-intake references must enforce RESTRICT at the schema layer.
do $guard$
declare
  v_triage uuid := (select triage_id from _wf_ids);
begin
  begin
    delete from public.intake_statuses where id=v_triage;
    raise exception 'used status unexpectedly deleted';
  exception
    when foreign_key_violation then null;
  end;
end $guard$;

-- Make pre_analysis individually notifiable, while the workspace policy remains disabled.
select public.update_intake_status_config_service(
  (select workspace_id from _wf_fixture),
  (select pre_analysis_id from _wf_ids),
  (select actor_id from _wf_fixture),
  'Em pré-análise',
  20,
  false,
  true,
  true,
  'in_progress'
);

update public.notification_settings
set status_notifications_enabled=false,
    sender_email='atendimento@classyrp.com.br'
where workspace_id=(select workspace_id from _wf_fixture);

create temporary table _wf_pre_analysis as
select *
from public.transition_intake_status_service(
  (select workspace_id from _wf_fixture),
  (select intake_id from _wf_ids),
  (select pre_analysis_id from _wf_ids),
  2,
  'workflow-reg-pre-analysis',
  null,
  (select actor_id from _wf_fixture),
  'ui'
);

select public.materialize_notification_batch(50);

do $$
begin
  if exists (
    select 1
    from public.notification_deliveries
    where intake_request_id=(select intake_id from _wf_ids)
      and event_type='intake.status_changed'
      and intent_key='customer_status'
  ) then
    raise exception 'workspace-disabled status notification created a delivery';
  end if;
end $$;

-- Enable the workspace policy and a second notifiable target.
select public.update_intake_status_config_service(
  (select workspace_id from _wf_fixture),
  (select awaiting_documents_id from _wf_ids),
  (select actor_id from _wf_fixture),
  'Aguardando documentos',
  30,
  false,
  true,
  true,
  'in_progress'
);

update public.notification_settings
set status_notifications_enabled=true
where workspace_id=(select workspace_id from _wf_fixture);

create temporary table _wf_awaiting as
select *
from public.transition_intake_status_service(
  (select workspace_id from _wf_fixture),
  (select intake_id from _wf_ids),
  (select awaiting_documents_id from _wf_ids),
  3,
  'workflow-reg-awaiting',
  null,
  (select actor_id from _wf_fixture),
  'ui'
);

select public.materialize_notification_batch(50);

create temporary table _wf_claim as
select * from public.claim_notification_delivery('workflow-reg-claim');

do $$
declare
  v record;
  v_result text;
begin
  select * into v from _wf_claim;
  if v.delivery_id is null then
    raise exception 'notifiable status did not create a claimable delivery';
  end if;

  v_result := public.record_notification_result(
    v.delivery_id,
    v.attempt_number,
    'accepted',
    null,
    null,
    'resend-workflow-regression-1',
    'workflow-reg-result'
  );

  if v_result <> 'sent' then
    raise exception 'delivery was not accepted before delayed callback test';
  end if;
end $$;

-- The intake advances again before the old provider callback arrives.
create temporary table _wf_after_send as
select *
from public.transition_intake_status_service(
  (select workspace_id from _wf_fixture),
  (select intake_id from _wf_ids),
  (select triage_id from _wf_ids),
  4,
  'workflow-reg-after-send',
  null,
  (select actor_id from _wf_fixture),
  'ui'
);

do $$
declare
  v_result text;
  v_current_status uuid;
  v_current_version integer;
begin
  v_result := public.record_resend_webhook_event(
    'svix-workflow-regression-delayed',
    'email.delivered',
    'resend-workflow-regression-1',
    now() - interval '2 minutes',
    encode(digest('workflow-regression-delayed-payload','sha256'),'hex')
  );

  if v_result <> 'processed' then
    raise exception 'delayed callback was not processed: %', v_result;
  end if;

  select status_id,row_version
  into v_current_status,v_current_version
  from public.intake_requests
  where id=(select intake_id from _wf_ids);

  if v_current_status <> (select triage_id from _wf_ids) or v_current_version <> 5 then
    raise exception 'delayed callback altered current intake state';
  end if;

  if not exists (
    select 1
    from public.notification_deliveries
    where provider_message_id='resend-workflow-regression-1'
      and status='delivered'
      and delivered_at is not null
  ) then
    raise exception 'delayed callback did not update its original delivery';
  end if;
end $$;

rollback;
