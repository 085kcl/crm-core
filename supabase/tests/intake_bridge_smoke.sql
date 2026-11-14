-- DP-CRM-018 / CLASSY bridge smoke test
-- Run only after 20260924214500_crm_v0032_intake_bridge_foundation.sql.
-- Entire fixture is rolled back.

begin;

create temporary table _bridge_fixture as
select
  gen_random_uuid()::text as suffix,
  encode(digest(gen_random_uuid()::text, 'sha256'), 'hex') as idem_hash,
  encode(digest('request-a-' || gen_random_uuid()::text, 'sha256'), 'hex') as request_hash;

do $$
begin
  set local role authenticated;
  begin
    perform public.submit_intake_bridge(
      'classy-pre-analysis',
      repeat('a', 64),
      repeat('b', 64),
      'Permission Test',
      'permission-test@example.invalid',
      null,
      '{}'::jsonb,
      gen_random_uuid()::text,
      'classy_admin',
      'pre_analysis',
      'permission-test'
    );
    raise exception 'authenticated role unexpectedly executed submit_intake_bridge';
  exception
    when insufficient_privilege then null;
  end;
  reset role;
end $$;

create temporary table _bridge_created as
select *
from public.submit_intake_bridge(
  'classy-pre-analysis',
  (select idem_hash from _bridge_fixture),
  (select request_hash from _bridge_fixture),
  'Cliente Bridge Smoke',
  'bridge-smoke-' || (select suffix from _bridge_fixture) || '@example.invalid',
  '+55 16 99999-1234',
  jsonb_build_object(
    'renda_mensal', 7500,
    'valor_imovel', 380000,
    'possui_fgts', true
  ),
  gen_random_uuid()::text,
  'classy_admin',
  'pre_analysis',
  'legacy-' || (select suffix from _bridge_fixture)
);

do $$
declare
  v_created record;
  v_intake public.intake_requests%rowtype;
  v_outbox_count integer;
  v_history_count integer;
  v_link_count integer;
begin
  select * into v_created from _bridge_created;
  if v_created.created is not true then
    raise exception 'first submission was not marked created';
  end if;
  if v_created.public_reference !~ '^CLA-[0-9]{4}-[0-9]+$' then
    raise exception 'unexpected public reference: %', v_created.public_reference;
  end if;

  select * into v_intake
  from public.intake_requests
  where public_reference = v_created.public_reference;

  if not found then raise exception 'intake row not found'; end if;
  if v_intake.contact_id is null then raise exception 'contact was not linked'; end if;
  if v_intake.lead_id is null then raise exception 'lead was not linked'; end if;
  if v_intake.contact_match_state <> 'new' then
    raise exception 'expected new contact, got %', v_intake.contact_match_state;
  end if;
  if v_intake.lead_link_state <> 'created' then
    raise exception 'expected created lead, got %', v_intake.lead_link_state;
  end if;

  select count(*) into v_outbox_count
  from public.outbox_events
  where aggregate_type = 'intake_request'
    and aggregate_id = v_intake.id
    and event_type = 'intake.created';
  if v_outbox_count <> 1 then raise exception 'expected one outbox event, got %', v_outbox_count; end if;

  select count(*) into v_history_count
  from public.intake_status_history
  where intake_request_id = v_intake.id;
  if v_history_count <> 1 then raise exception 'expected one initial status history row, got %', v_history_count; end if;

  select count(*) into v_link_count
  from public.integration_links
  where crm_entity_type = 'intake_request'
    and crm_entity_id = v_intake.id
    and source_system = 'classy_admin';
  if v_link_count <> 1 then raise exception 'expected one integration link, got %', v_link_count; end if;
end $$;

create temporary table _bridge_replay as
select *
from public.submit_intake_bridge(
  'classy-pre-analysis',
  (select idem_hash from _bridge_fixture),
  (select request_hash from _bridge_fixture),
  'Cliente Bridge Smoke',
  'bridge-smoke-' || (select suffix from _bridge_fixture) || '@example.invalid',
  '+55 16 99999-1234',
  jsonb_build_object(
    'renda_mensal', 7500,
    'valor_imovel', 380000,
    'possui_fgts', true
  ),
  gen_random_uuid()::text,
  'classy_admin',
  'pre_analysis',
  'legacy-' || (select suffix from _bridge_fixture)
);

do $$
declare
  v_first record;
  v_replay record;
  v_intake_count integer;
begin
  select * into v_first from _bridge_created;
  select * into v_replay from _bridge_replay;

  if v_replay.created is not false then
    raise exception 'replay was not marked as replay';
  end if;
  if v_replay.public_reference <> v_first.public_reference then
    raise exception 'replay returned a different reference';
  end if;

  select count(*) into v_intake_count
  from public.intake_requests
  where idempotency_key_hash = (select idem_hash from _bridge_fixture);
  if v_intake_count <> 1 then
    raise exception 'idempotency created % intakes', v_intake_count;
  end if;
end $$;

do $$
begin
  begin
    perform public.submit_intake_bridge(
      'classy-pre-analysis',
      (select idem_hash from _bridge_fixture),
      encode(digest('different-content', 'sha256'), 'hex'),
      'Cliente Bridge Smoke',
      'bridge-smoke-' || (select suffix from _bridge_fixture) || '@example.invalid',
      '+55 16 99999-1234',
      '{"renda_mensal":9999}'::jsonb,
      gen_random_uuid()::text,
      'classy_admin',
      'pre_analysis',
      'legacy-' || (select suffix from _bridge_fixture)
    );
    raise exception 'conflicting replay unexpectedly succeeded';
  exception
    when unique_violation then
      if sqlerrm not like '%intake_idempotency_conflict%' then
        raise;
      end if;
  end;
end $$;

rollback;
