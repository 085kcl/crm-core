-- DP-CRM-019 transactional notifications smoke test.
-- Requires DP-CRM-018 + notification migration. Entire fixture is rolled back.

begin;

create temporary table _notify_fixture as
select
  encode(digest(gen_random_uuid()::text, 'sha256'), 'hex') as idem_hash,
  encode(digest('notify-request-' || gen_random_uuid()::text, 'sha256'), 'hex') as request_hash,
  gen_random_uuid()::text as suffix;

update public.notification_settings ns
set sender_email = 'atendimento@classyrp.com.br',
    reply_to = 'contato@classyrp.com.br',
    new_request_recipients = array['owner@example.invalid','OWNER@example.invalid'],
    customer_confirmation_enabled = true,
    company_notification_enabled = true
from public.workspaces w
where ns.workspace_id = w.id
  and w.slug = 'classy';

do $$
declare
  v_recipients text[];
begin
  select ns.new_request_recipients into v_recipients
  from public.notification_settings ns
  join public.workspaces w on w.id = ns.workspace_id
  where w.slug = 'classy';

  if cardinality(v_recipients) <> 1 or v_recipients[1] <> 'owner@example.invalid' then
    raise exception 'notification recipients were not normalized/deduplicated: %', v_recipients;
  end if;
end $$;

create temporary table _notify_intake as
select *
from public.submit_intake_bridge(
  'classy-pre-analysis',
  (select idem_hash from _notify_fixture),
  (select request_hash from _notify_fixture),
  'Cliente Notification Smoke',
  'notify-smoke-' || (select suffix from _notify_fixture) || '@example.invalid',
  '+55 16 99999-5678',
  '{"renda_mensal":8500,"valor_imovel":420000}'::jsonb,
  gen_random_uuid()::text,
  'classy_admin',
  'pre_analysis',
  'notify-legacy-' || (select suffix from _notify_fixture)
);

do $$
declare
  v_materialized integer;
  v_delivery_count integer;
  v_intake_id uuid;
begin
  select id into v_intake_id
  from public.intake_requests
  where public_reference = (select public_reference from _notify_intake);

  v_materialized := public.materialize_notification_batch(10);

  select count(*) into v_delivery_count
  from public.notification_deliveries
  where intake_request_id = v_intake_id;

  if v_delivery_count <> 2 then
    raise exception 'expected 2 deliveries, got %', v_delivery_count;
  end if;

  if not exists (
    select 1 from public.notification_deliveries
    where intake_request_id = v_intake_id
      and intent_key = 'company_internal'
      and recipient = 'owner@example.invalid'
  ) then
    raise exception 'internal notification delivery missing';
  end if;

  if not exists (
    select 1 from public.notification_deliveries
    where intake_request_id = v_intake_id
      and intent_key = 'customer_receipt'
  ) then
    raise exception 'customer receipt delivery missing';
  end if;

  if exists (
    select 1 from public.outbox_events
    where aggregate_id = v_intake_id
      and event_type = 'intake.created'
      and processed_at is null
  ) then
    raise exception 'intake outbox event was not marked processed';
  end if;
end $$;

create temporary table _claim_one as
select * from public.claim_notification_delivery('notify-smoke-claim-1');

do $$
declare
  v record;
  v_result text;
begin
  select * into v from _claim_one;
  if v.delivery_id is null then
    raise exception 'first delivery was not claimed';
  end if;
  if v.attempt_number <> 1 then
    raise exception 'unexpected first attempt number: %', v.attempt_number;
  end if;

  v_result := public.record_notification_result(
    v.delivery_id,
    v.attempt_number,
    'accepted',
    null,
    null,
    'resend-smoke-message-1',
    'notify-smoke-result-1'
  );

  if v_result <> 'sent' then
    raise exception 'accepted delivery did not become sent: %', v_result;
  end if;

  if not exists (
    select 1 from public.notification_delivery_attempts
    where delivery_id = v.delivery_id
      and attempt_number = 1
      and result = 'accepted'
      and finished_at is not null
  ) then
    raise exception 'accepted attempt history missing';
  end if;
end $$;

do $$
declare
  v_first text;
  v_duplicate text;
  v_delivery_id uuid;
begin
  select delivery_id into v_delivery_id from _claim_one;

  v_first := public.record_resend_webhook_event(
    'svix-smoke-event-1',
    'email.delivered',
    'resend-smoke-message-1',
    now(),
    encode(digest('provider-event-1', 'sha256'), 'hex')
  );

  v_duplicate := public.record_resend_webhook_event(
    'svix-smoke-event-1',
    'email.delivered',
    'resend-smoke-message-1',
    now(),
    encode(digest('provider-event-1', 'sha256'), 'hex')
  );

  if v_first <> 'processed' or v_duplicate <> 'duplicate' then
    raise exception 'unexpected webhook results: %, %', v_first, v_duplicate;
  end if;

  if not exists (
    select 1 from public.notification_deliveries
    where id = v_delivery_id and status = 'delivered' and delivered_at is not null
  ) then
    raise exception 'delivery was not advanced to delivered';
  end if;
end $$;

create temporary table _claim_two as
select * from public.claim_notification_delivery('notify-smoke-claim-2');

do $$
declare
  v record;
  v_result text;
begin
  select * into v from _claim_two;
  if v.delivery_id is null then
    raise exception 'second delivery was not claimed';
  end if;

  v_result := public.record_notification_result(
    v.delivery_id,
    v.attempt_number,
    'rejected',
    'transient',
    'rate_limit_exceeded',
    null,
    'notify-smoke-result-2'
  );

  if v_result <> 'retry_scheduled' then
    raise exception 'transient failure did not schedule retry: %', v_result;
  end if;

  if not exists (
    select 1 from public.notification_deliveries
    where id = v.delivery_id
      and status = 'failed'
      and retryable
      and next_attempt_at is not null
      and failure_kind = 'transient'
  ) then
    raise exception 'retry state was not persisted';
  end if;
end $$;

do $$
declare
  v record;
  v_actor uuid;
  v_workspace uuid;
  v_result text;
  v_attempt_count integer;
begin
  select * into v from _claim_two;

  select workspace_id into v_workspace
  from public.notification_deliveries
  where id = v.delivery_id;

  select user_id into v_actor
  from public.workspace_members
  where workspace_id = v_workspace
    and status = 'active'
    and role in ('owner','admin','manager')
  order by case role when 'owner' then 1 when 'admin' then 2 else 3 end
  limit 1;

  if v_actor is null then
    raise exception 'no authorized actor available for retry smoke';
  end if;

  select attempt_count into v_attempt_count
  from public.notification_deliveries
  where id = v.delivery_id;

  v_result := public.request_notification_retry(
    v_workspace,
    v.delivery_id,
    v_actor,
    'Smoke test: causa transitória corrigida.'
  );

  if v_result <> 'retry_scheduled' then
    raise exception 'manual retry not scheduled: %', v_result;
  end if;

  if not exists (
    select 1
    from public.notification_deliveries
    where id = v.delivery_id
      and status = 'failed'
      and retryable
      and next_attempt_at <= now()
      and attempt_count = v_attempt_count
  ) then
    raise exception 'manual retry changed identity/count or was not queued';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where workspace_id = v_workspace
      and user_id = v_actor
      and resource_type = 'notification_delivery'
      and resource_id = v.delivery_id
      and action = 'notification.retry_requested'
  ) then
    raise exception 'manual retry audit row missing';
  end if;
end $$;

do $$
begin
  set local role authenticated;
  begin
    perform public.materialize_notification_batch(1);
    raise exception 'authenticated role unexpectedly executed notification dispatcher RPC';
  exception
    when insufficient_privilege then null;
  end;
  reset role;
end $$;

rollback;
