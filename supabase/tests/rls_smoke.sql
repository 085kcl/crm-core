-- CRM Core Supabase transactional smoke tests.
-- All fixtures and assertions are rolled back at the end.

begin;

create temp table crm_test_context (
  key text primary key,
  value uuid not null
);

create temp table crm_test_results (
  test text primary key,
  passed boolean not null,
  detail text not null
);

grant all on table pg_temp.crm_test_context, pg_temp.crm_test_results to authenticated;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'codex-e2e-owner-a@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Owner A"}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'codex-e2e-owner-b@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Owner B"}'::jsonb,
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'codex-e2e-viewer@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Viewer"}'::jsonb,
    now(),
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'codex-e2e-admin@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'codex-e2e-sales@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Sales"}'::jsonb,
    now(),
    now()
  );

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'auth_profile_bootstrap',
  count(*) = 5,
  format('profiles=%s', count(*))
from public.profiles
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555'
);

-- Each owner creates one workspace through the public RPC.
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
set local role authenticated;

insert into pg_temp.crm_test_context(key, value)
values ('workspace_a', public.create_workspace('Codex E2E A', 'codex-e2e-a'));

set local role postgres;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
set local role authenticated;

insert into pg_temp.crm_test_context(key, value)
values ('workspace_b', public.create_workspace('Codex E2E B', 'codex-e2e-b'));

insert into public.contacts(id, workspace_id, first_name, email, owner_id)
select
  'abababab-abab-4bab-8bab-abababababab',
  value,
  'Contato B',
  'contato-b@example.invalid',
  '22222222-2222-4222-8222-222222222222'
from pg_temp.crm_test_context
where key = 'workspace_b';

set local role postgres;

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'workspace_rpc_owner_membership',
  count(*) = 2,
  format('owner_memberships=%s', count(*))
from public.workspace_members wm
join pg_temp.crm_test_context c on c.value = wm.workspace_id
where wm.role = 'owner' and wm.status = 'active';

-- Owner A can add the other roles used by the RBAC matrix.
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
set local role authenticated;

insert into public.workspace_members(workspace_id, user_id, role)
select c.value, member.user_id, member.role
from pg_temp.crm_test_context c
cross join (
  values
    ('33333333-3333-4333-8333-333333333333'::uuid, 'viewer'::public.workspace_role),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'admin'::public.workspace_role),
    ('55555555-5555-4555-8555-555555555555'::uuid, 'sales'::public.workspace_role)
) member(user_id, role)
where c.key = 'workspace_a';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'owner_tenant_visibility',
  count(*) = 1 and bool_and(slug = 'codex-e2e-a'),
  format('visible_workspaces=%s', count(*))
from public.workspaces;

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'cross_tenant_select_is_empty',
  count(*) = 0,
  format('visible_foreign_contacts=%s', count(*))
from public.contacts
where id = 'abababab-abab-4bab-8bab-abababababab';

do $test$
declare
  affected integer;
begin
  update public.contacts
  set first_name = 'Cross-tenant update'
  where id = 'abababab-abab-4bab-8bab-abababababab';
  get diagnostics affected = row_count;

  insert into pg_temp.crm_test_results values (
    'cross_tenant_update_is_empty',
    affected = 0,
    format('affected_rows=%s', affected)
  );
end
$test$;

do $test$
declare
  affected integer;
begin
  delete from public.contacts
  where id = 'abababab-abab-4bab-8bab-abababababab';
  get diagnostics affected = row_count;

  insert into pg_temp.crm_test_results values (
    'cross_tenant_delete_is_empty',
    affected = 0,
    format('affected_rows=%s', affected)
  );
end
$test$;

insert into public.contacts(
  id,
  workspace_id,
  first_name,
  email,
  owner_id,
  created_by,
  updated_by
)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  value,
  'Contato E2E',
  'contato-e2e@example.invalid',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222'
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'actor_fields_are_server_stamped',
  created_by = '11111111-1111-4111-8111-111111111111'
    and updated_by = '11111111-1111-4111-8111-111111111111',
  format('created_by=%s updated_by=%s', created_by, updated_by)
from public.contacts
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'owner_can_read_generated_audit',
  count(*) = 1,
  format('audit_rows=%s', count(*))
from public.audit_logs
where resource_type = 'contacts'
  and resource_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and action = 'insert';

do $test$
begin
  begin
    insert into public.contacts(id, workspace_id, first_name)
    select
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      value,
      'Cross tenant should fail'
    from pg_temp.crm_test_context
    where key = 'workspace_b';

    insert into pg_temp.crm_test_results values (
      'cross_tenant_write_is_denied',
      false,
      'insert unexpectedly succeeded'
    );
  exception
    when sqlstate '42501' then
      insert into pg_temp.crm_test_results values (
        'cross_tenant_write_is_denied',
        true,
        'RLS returned 42501'
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'cross_tenant_write_is_denied',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

do $test$
declare
  table_name text;
  record_id uuid;
begin
  foreach table_name in array array['tasks', 'notes', 'activities'] loop
    record_id := case table_name
      when 'tasks' then '61616161-6161-4161-8161-616161616161'::uuid
      when 'notes' then '62626262-6262-4262-8262-626262626262'::uuid
      else '63636363-6363-4363-8363-636363636363'::uuid
    end;

    begin
      if table_name = 'tasks' then
        insert into public.tasks(id, workspace_id, title, entity_type, entity_id)
        select record_id, value, 'Cross-tenant task', 'contact',
          'abababab-abab-4bab-8bab-abababababab'
        from pg_temp.crm_test_context where key = 'workspace_a';
      elsif table_name = 'notes' then
        insert into public.notes(id, workspace_id, body, entity_type, entity_id)
        select record_id, value, 'Cross-tenant note', 'contact',
          'abababab-abab-4bab-8bab-abababababab'
        from pg_temp.crm_test_context where key = 'workspace_a';
      else
        insert into public.activities(id, workspace_id, type, entity_type, entity_id)
        select record_id, value, 'cross_tenant.probe', 'contact',
          'abababab-abab-4bab-8bab-abababababab'
        from pg_temp.crm_test_context where key = 'workspace_a';
      end if;

      insert into pg_temp.crm_test_results values (
        'polymorphic_' || table_name || '_cross_tenant_denied',
        false,
        'insert unexpectedly succeeded'
      );
    exception
      when foreign_key_violation then
        insert into pg_temp.crm_test_results values (
          'polymorphic_' || table_name || '_cross_tenant_denied',
          true,
          'tenant integrity trigger returned 23503'
        );
      when others then
        insert into pg_temp.crm_test_results values (
          'polymorphic_' || table_name || '_cross_tenant_denied',
          false,
          format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
        );
    end;
  end loop;
end
$test$;

insert into public.tags(id, workspace_id, name, slug)
select
  '64646464-6464-4464-8464-646464646464',
  value,
  'Cliente estratégico',
  'cliente-estrategico'
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into public.entity_tags(id, workspace_id, tag_id, entity_type, entity_id)
select
  '65656565-6565-4565-8565-656565656565',
  value,
  '64646464-6464-4464-8464-646464646464',
  'contact',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into public.custom_field_definitions(
  id, workspace_id, entity_type, key, label, field_type, options
)
select
  '66666666-6666-4666-8666-666666666666',
  value,
  'contact',
  'canal_preferido',
  'Canal preferido',
  'select',
  '["Email","WhatsApp"]'::jsonb
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into public.custom_field_values(
  id, workspace_id, definition_id, entity_type, entity_id, value
)
select
  '67676767-6767-4767-8767-676767676767',
  value,
  '66666666-6666-4666-8666-666666666666',
  'contact',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '"WhatsApp"'::jsonb
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'tags_and_custom_fields_valid_path',
  (
    select count(*) = 1
    from public.entity_tags
    where id = '65656565-6565-4565-8565-656565656565'
  ) and (
    select count(*) = 1
    from public.custom_field_values
    where id = '67676767-6767-4767-8767-676767676767'
  ),
  'valid tag assignment and select value persisted'
;

do $test$
begin
  begin
    insert into public.entity_tags(id, workspace_id, tag_id, entity_type, entity_id)
    select
      '68686868-6868-4868-8868-686868686868',
      value,
      '64646464-6464-4464-8464-646464646464',
      'contact',
      'abababab-abab-4bab-8bab-abababababab'
    from pg_temp.crm_test_context
    where key = 'workspace_a';

    insert into pg_temp.crm_test_results values (
      'tag_cross_tenant_entity_denied',
      false,
      'insert unexpectedly succeeded'
    );
  exception
    when foreign_key_violation then
      insert into pg_temp.crm_test_results values (
        'tag_cross_tenant_entity_denied',
        true,
        'tenant integrity trigger returned 23503'
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'tag_cross_tenant_entity_denied',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

do $test$
begin
  begin
    insert into public.custom_field_values(
      id, workspace_id, definition_id, entity_type, entity_id, value
    )
    select
      '69696969-6969-4969-8969-696969696969',
      value,
      '66666666-6666-4666-8666-666666666666',
      'contact',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '"Telegram"'::jsonb
    from pg_temp.crm_test_context
    where key = 'workspace_a';

    insert into pg_temp.crm_test_results values (
      'custom_field_select_options_enforced',
      false,
      'insert unexpectedly succeeded'
    );
  exception
    when check_violation then
      insert into pg_temp.crm_test_results values (
        'custom_field_select_options_enforced',
        true,
        'select option validation returned 23514'
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'custom_field_select_options_enforced',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

do $test$
begin
  begin
    insert into public.contacts(id, workspace_id, first_name, owner_id)
    select
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      value,
      'Inactive owner should fail',
      '22222222-2222-4222-8222-222222222222'
    from pg_temp.crm_test_context
    where key = 'workspace_a';

    insert into pg_temp.crm_test_results values (
      'owner_reference_requires_active_membership',
      false,
      'insert unexpectedly succeeded'
    );
  exception
    when sqlstate '23514' then
      insert into pg_temp.crm_test_results values (
        'owner_reference_requires_active_membership',
        true,
        'active-membership trigger returned 23514'
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'owner_reference_requires_active_membership',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

do $test$
begin
  begin
    delete from public.workspace_members
    where workspace_id = (
      select value from pg_temp.crm_test_context where key = 'workspace_a'
    )
      and user_id = '11111111-1111-4111-8111-111111111111';

    insert into pg_temp.crm_test_results values (
      'last_active_owner_is_protected',
      false,
      'delete unexpectedly succeeded'
    );
  exception
    when sqlstate 'P0001' then
      insert into pg_temp.crm_test_results values (
        'last_active_owner_is_protected',
        sqlerrm = 'workspace_must_have_active_owner',
        sqlerrm
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'last_active_owner_is_protected',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

-- Admin can manage ordinary membership but cannot create or remove owners.
set local role postgres;
select set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  true
);
set local role authenticated;

do $test$
begin
  begin
    update public.workspace_members
    set role = 'owner'
    where workspace_id = (
      select value from pg_temp.crm_test_context where key = 'workspace_a'
    )
      and user_id = '44444444-4444-4444-8444-444444444444';

    insert into pg_temp.crm_test_results values (
      'admin_cannot_escalate_to_owner',
      false,
      'update unexpectedly succeeded'
    );
  exception
    when sqlstate '42501' then
      insert into pg_temp.crm_test_results values (
        'admin_cannot_escalate_to_owner',
        true,
        'RLS WITH CHECK returned 42501'
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'admin_cannot_escalate_to_owner',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

do $test$
declare
  affected integer;
begin
  delete from public.workspace_members
  where workspace_id = (
    select value from pg_temp.crm_test_context where key = 'workspace_a'
  )
    and user_id = '11111111-1111-4111-8111-111111111111';
  get diagnostics affected = row_count;

  insert into pg_temp.crm_test_results values (
    'admin_cannot_remove_owner',
    affected = 0,
    format('affected_rows=%s', affected)
  );
end
$test$;

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'admin_can_read_audit',
  count(*) > 0,
  format('visible_audit_rows=%s', count(*))
from public.audit_logs;

-- Sales can write operational data but cannot perform destructive operations.
set local role postgres;
select set_config(
  'request.jwt.claim.sub',
  '55555555-5555-4555-8555-555555555555',
  true
);
set local role authenticated;

insert into public.contacts(id, workspace_id, first_name, email)
select
  '70707070-7070-4070-8070-707070707070',
  value,
  'Contato Sales',
  'sales-created@example.invalid'
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'sales_can_insert_operational_data',
  count(*) = 1,
  format('created_contacts=%s', count(*))
from public.contacts
where id = '70707070-7070-4070-8070-707070707070';

do $test$
declare
  affected integer;
begin
  delete from public.contacts
  where id = '70707070-7070-4070-8070-707070707070';
  get diagnostics affected = row_count;

  insert into pg_temp.crm_test_results values (
    'sales_cannot_delete_operational_data',
    affected = 0,
    format('affected_rows=%s', affected)
  );
end
$test$;

-- Viewer can read tenant records but cannot mutate them or read audit logs.
set local role postgres;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);
set local role authenticated;

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'viewer_can_read_tenant_data',
  count(*) = 1,
  format('visible_contacts=%s', count(*))
from public.contacts
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'viewer_cannot_read_audit',
  count(*) = 0,
  format('visible_audit_rows=%s', count(*))
from public.audit_logs;

do $test$
begin
  begin
    insert into public.tasks(id, workspace_id, title)
    select
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      value,
      'Viewer write should fail'
    from pg_temp.crm_test_context
    where key = 'workspace_a';

    insert into pg_temp.crm_test_results values (
      'viewer_is_read_only',
      false,
      'insert unexpectedly succeeded'
    );
  exception
    when sqlstate '42501' then
      insert into pg_temp.crm_test_results values (
        'viewer_is_read_only',
        true,
        'RLS returned 42501'
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'viewer_is_read_only',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

do $test$
declare
  updated_rows integer;
  deleted_rows integer;
begin
  update public.contacts
  set first_name = 'Viewer update'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  get diagnostics updated_rows = row_count;

  delete from public.contacts
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  get diagnostics deleted_rows = row_count;

  insert into pg_temp.crm_test_results values (
    'viewer_update_and_delete_are_denied',
    updated_rows = 0 and deleted_rows = 0,
    format('updated_rows=%s deleted_rows=%s', updated_rows, deleted_rows)
  );
end
$test$;

-- Domain lifecycle tests as Owner A.
set local role postgres;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
set local role authenticated;

insert into public.pipelines(id, workspace_id, name, is_default)
select
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  value,
  'Pipeline E2E',
  true
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into public.pipeline_stages(
  id,
  workspace_id,
  pipeline_id,
  name,
  position,
  probability,
  state
)
select
  'f1111111-1111-4111-8111-111111111111'::uuid,
  value,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
  'Aberto',
  0,
  10,
  'open'::public.deal_state
from pg_temp.crm_test_context
where key = 'workspace_a'
union all
select
  'f2222222-2222-4222-8222-222222222222'::uuid,
  value,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
  'Ganho',
  1,
  100,
  'won'::public.deal_state
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into public.deals(
  id,
  workspace_id,
  pipeline_id,
  stage_id,
  title,
  contact_id,
  owner_id,
  state
)
select
  '99999999-9999-4999-8999-999999999999',
  value,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'f1111111-1111-4111-8111-111111111111',
  'Deal E2E',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'lost'
from pg_temp.crm_test_context
where key = 'workspace_a';

update public.deals
set stage_id = 'f2222222-2222-4222-8222-222222222222'
where id = '99999999-9999-4999-8999-999999999999';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'deal_state_follows_stage',
  state = 'won' and closed_at is not null and lost_reason is null,
  format('state=%s closed_at_set=%s', state, closed_at is not null)
from public.deals
where id = '99999999-9999-4999-8999-999999999999';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'deal_stage_change_creates_activity',
  count(*) = 1
    and bool_and(actor_id = '11111111-1111-4111-8111-111111111111'),
  format('stage_change_activities=%s', count(*))
from public.activities
where entity_type = 'deal'
  and entity_id = '99999999-9999-4999-8999-999999999999'
  and type = 'deal.stage_changed';

insert into public.tasks(id, workspace_id, title, status)
select
  '12121212-1212-4212-8212-121212121212',
  value,
  'Task E2E',
  'completed'
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'task_completion_is_timestamped',
  completed_at is not null,
  format('completed_at_set=%s', completed_at is not null)
from public.tasks
where id = '12121212-1212-4212-8212-121212121212';

insert into public.leads(id, workspace_id, contact_id, status)
select
  '13131313-1313-4313-8313-131313131313',
  value,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'converted'
from pg_temp.crm_test_context
where key = 'workspace_a';

insert into pg_temp.crm_test_results(test, passed, detail)
select
  'lead_conversion_is_timestamped',
  converted_at is not null,
  format('converted_at_set=%s', converted_at is not null)
from public.leads
where id = '13131313-1313-4313-8313-131313131313';

do $test$
begin
  begin
    update public.activities
    set metadata = '{"tampered":true}'::jsonb
    where entity_type = 'deal'
      and entity_id = '99999999-9999-4999-8999-999999999999';

    insert into pg_temp.crm_test_results values (
      'activities_are_append_only',
      false,
      'update unexpectedly succeeded'
    );
  exception
    when sqlstate '42501' then
      insert into pg_temp.crm_test_results values (
        'activities_are_append_only',
        true,
        'table grant returned 42501'
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'activities_are_append_only',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

-- Constraint test bypasses RLS so the composite FK itself is exercised.
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);

insert into public.companies(id, workspace_id, trade_name)
select
  '14141414-1414-4414-8414-141414141414',
  value,
  'Company B E2E'
from pg_temp.crm_test_context
where key = 'workspace_b';

do $test$
begin
  begin
    insert into public.contact_companies(
      workspace_id,
      contact_id,
      company_id
    )
    select
      (select value from pg_temp.crm_test_context where key = 'workspace_a'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '14141414-1414-4414-8414-141414141414';

    insert into pg_temp.crm_test_results values (
      'composite_fk_blocks_cross_tenant_reference',
      false,
      'insert unexpectedly succeeded'
    );
  exception
    when foreign_key_violation then
      insert into pg_temp.crm_test_results values (
        'composite_fk_blocks_cross_tenant_reference',
        true,
        'composite FK returned 23503'
      );
    when others then
      insert into pg_temp.crm_test_results values (
        'composite_fk_blocks_cross_tenant_reference',
        false,
        format('unexpected SQLSTATE %s: %s', sqlstate, sqlerrm)
      );
  end;
end
$test$;

insert into pg_temp.crm_test_results values (
  'anon_has_no_table_access',
  not has_table_privilege('anon', 'public.workspaces', 'select'),
  format(
    'anon_workspaces_select=%s',
    has_table_privilege('anon', 'public.workspaces', 'select')
  )
);

insert into pg_temp.crm_test_results values (
  'outbox_is_worker_only',
  not has_table_privilege('authenticated', 'public.outbox_events', 'select')
    and not has_table_privilege('authenticated', 'public.outbox_events', 'insert'),
  format(
    'authenticated_select=%s authenticated_insert=%s',
    has_table_privilege('authenticated', 'public.outbox_events', 'select'),
    has_table_privilege('authenticated', 'public.outbox_events', 'insert')
  )
);

do $test$
declare
  failures text;
begin
  select string_agg(test || ': ' || detail, E'\n' order by test)
  into failures
  from pg_temp.crm_test_results
  where not passed;

  if failures is not null then
    raise exception 'CRM foundation smoke failures:%', E'\n' || failures;
  end if;
end
$test$;

select test, passed, detail
from pg_temp.crm_test_results
order by test;

rollback;
