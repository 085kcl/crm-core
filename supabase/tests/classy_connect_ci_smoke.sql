-- CI-only smoke tests for the CLASSY Connect migrations.
-- Requires the isolated bootstrap + both migrations. Never run against live data.
\set ON_ERROR_STOP on

insert into public.connect_channels(workspace_id,provider,external_account_id,active)
values
('11111111-1111-4111-8111-111111111111','whatsapp','test_phone_1',true),
('22222222-2222-4222-8222-222222222222','instagram','test_instagram_2',true);

do $$
declare
  n integer;
  payload jsonb := jsonb_build_array(
    jsonb_build_object(
      'provider','whatsapp','external_account_id','test_phone_1',
      'event_hash',repeat('a',64),'event_kind','whatsapp.change',
      'payload',jsonb_build_object('field','messages','value',jsonb_build_object('messages','[]'::jsonb))
    ),
    jsonb_build_object(
      'provider','instagram','external_account_id','test_instagram_2',
      'event_hash',repeat('b',64),'event_kind','instagram.entry',
      'payload',jsonb_build_object('id','test_instagram_2','messaging','[]'::jsonb)
    )
  );
begin
  select public.ingest_connect_webhook_events(payload) into n;
  if n <> 2 then raise exception 'connect_initial_ingest_failed: %', n; end if;
  select public.ingest_connect_webhook_events(payload) into n;
  if n <> 0 then raise exception 'connect_ingest_replay_not_idempotent: %', n; end if;
  if (select count(*) from public.connect_webhook_events) <> 2 then
    raise exception 'connect_ingest_count_incorrect';
  end if;
end;
$$;

do $$
declare e record;
        n integer := 0;
        inserted boolean;
        acknowledged boolean;
begin
  for e in select * from public.claim_connect_events(5) loop
    n := n + 1;
    if e.provider = 'whatsapp' then
      select public.record_connect_inbound_message(
        e.event_id,'551199999999','wamid.signed.test.1','Olá, CLASSY',
        'text',now(),'Pessoa de Teste'
      ) into inserted;
      if not inserted then raise exception 'connect_inbound_not_inserted'; end if;
      select public.record_connect_inbound_message(
        e.event_id,'551199999999','wamid.signed.test.1','Olá, CLASSY',
        'text',now(),'Pessoa de Teste'
      ) into inserted;
      if inserted then raise exception 'connect_duplicate_message_accepted'; end if;
      select public.finish_connect_event(
        e.event_id,gen_random_uuid(),true,null
      ) into acknowledged;
      if acknowledged then raise exception 'stale_claim_ack_accepted'; end if;
    end if;
    select public.finish_connect_event(e.event_id,e.claim_id,true,null) into acknowledged;
    if not acknowledged then raise exception 'claim_ack_failed'; end if;
  end loop;
  if n <> 2 then raise exception 'claim_count_invalid: %', n; end if;
  if (select count(*) from public.connect_conversations) <> 1
     or (select count(*) from public.connect_messages) <> 1 then
    raise exception 'unexpected_conversation_or_message_count';
  end if;
  -- Successful acknowledgements must erase raw PII but keep deduplication hashes.
  if exists (
    select 1 from public.connect_webhook_events
    where status = 'processed' and payload <> '{}'::jsonb
  ) then
    raise exception 'processed_meta_payload_not_redacted';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon','public.connect_messages','SELECT')
    or has_table_privilege('authenticated','public.connect_webhook_events','SELECT')
    or has_function_privilege(
      'authenticated','public.claim_connect_events(integer)','EXECUTE'
    )
    or has_function_privilege(
      'authenticated','public.record_connect_inbound_message(uuid,text,text,text,text,timestamptz,text)','EXECUTE'
    ) then
    raise exception 'restricted_provider_data_or_rpc_exposed';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
declare n integer;
begin
  select count(*) into n from public.connect_conversations;
  if n <> 1 then raise exception 'workspace_a_sales_visibility_invalid: %', n; end if;
  update public.connect_conversations
    set assigned_to='33333333-3333-4333-8333-333333333333',
        row_version=2
    where workspace_id='11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'sales_claim_failed: %', n; end if;
end;
$$;

set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
declare n integer;
begin
  update public.connect_conversations
    set assigned_to=null,row_version=3
    where workspace_id='11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'other_sales_released_colleague_conversation'; end if;
end;
$$;

set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$
begin
  if (select count(*) from public.connect_conversations) <> 0
     or (select count(*) from public.connect_messages) <> 0 then
    raise exception 'viewer_received_private_conversation_data';
  end if;
end;
$$;

set request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
do $$
begin
  if (select count(*) from public.connect_conversations) <> 0 then
    raise exception 'cross_workspace_conversation_visible';
  end if;
end;
$$;

set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$
declare n integer;
        rejected boolean := false;
begin
  update public.connect_conversations
    set assigned_to='44444444-4444-4444-8444-444444444444',
        row_version=3
    where workspace_id='11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'manager_reassignment_failed'; end if;

  begin
    update public.connect_conversations
      set contact_id='99999999-9999-4999-8999-999999999999',
          row_version=4
      where workspace_id='11111111-1111-4111-8111-111111111111';
  exception when foreign_key_violation then
    rejected := true;
  end;
  if not rejected then raise exception 'cross_workspace_contact_link_accepted'; end if;

  update public.connect_conversations
    set contact_id='88888888-8888-4888-8888-888888888888',
        row_version=4
    where workspace_id='11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'valid_contact_link_failed'; end if;

  if (select count(*) from public.connect_conversation_control_audit) < 3 then
    raise exception 'operator_control_audit_missing';
  end if;
end;
$$;
reset role;
reset request.jwt.claim.sub;

-- An incoming newer message reopens a closed conversation without duplicate events.
update public.connect_conversations
set status = 'closed', row_version = row_version + 1
where workspace_id='11111111-1111-4111-8111-111111111111';

do $connect_reopen$
declare
  n integer;
  e record;
  inserted boolean := false;
begin
  select public.ingest_connect_webhook_events(
    jsonb_build_array(jsonb_build_object(
      'provider','whatsapp',
      'external_account_id','test_phone_1',
      'event_hash',repeat('c',64),
      'event_kind','whatsapp.change',
      'payload',jsonb_build_object('field','messages')
    ))
  ) into n;
  if n <> 1 then raise exception 'new_inbound_event_not_queued'; end if;

  for e in select * from public.claim_connect_events(1) loop
    select public.record_connect_inbound_message(
      e.event_id,'551199999999','wamid.new.2',
      'Gostaria de retomar meu atendimento','text',now()+interval '1 second',null
    ) into inserted;
    if not inserted then raise exception 'new_message_not_inserted'; end if;
    if not public.finish_connect_event(e.event_id,e.claim_id,true,null) then
      raise exception 'new_event_not_acked';
    end if;
  end loop;
  if not inserted then raise exception 'new_event_not_claimed'; end if;
  if not exists (
    select 1 from public.connect_conversations
    where status='open' and row_version=6
      and last_message_preview='Gostaria de retomar meu atendimento'
  ) then
    raise exception 'new_inbound_failed_to_reopen_closed_conversation';
  end if;
  if (select count(*) from public.connect_messages) <> 2 then
    raise exception 'new_inbound_duplicate_or_missing_message';
  end if;
end;
$connect_reopen$;

select 'CLASSY Connect isolated SQL smoke passed' as result;
