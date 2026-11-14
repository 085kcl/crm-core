-- FERNANDES only: typed writes, updates and viewer protection; fixtures roll back.
begin;
insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'metadata-owner@example.invalid', '', now(), '{}', '{}', now(), now()),
       ('e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'metadata-viewer@example.invalid', '', now(), '{}', '{}', now(), now());
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.create_workspace('Metadata tests', 'metadata-types-test');

do $test$
declare
  workspace uuid;
  contact uuid;
  definition uuid;
  sample record;
begin
  select id into strict workspace from public.workspaces where slug = 'metadata-types-test';
  insert into public.workspace_members(workspace_id, user_id, role) values (workspace, 'e1000000-0000-4000-8000-000000000002', 'viewer');
  insert into public.contacts(workspace_id, first_name) values (workspace, 'Fictício') returning id into contact;
  for sample in select * from (values
    ('text', '"Texto"'::jsonb, '1'::jsonb),
    ('textarea', '"Texto longo"'::jsonb, 'true'::jsonb),
    ('integer', '10'::jsonb, '1.5'::jsonb),
    ('decimal', '1.5'::jsonb, '"1.5"'::jsonb),
    ('currency', '19.99'::jsonb, '"19.99"'::jsonb),
    ('boolean', 'false'::jsonb, '"false"'::jsonb),
    ('date', '"2026-09-09"'::jsonb, '9'::jsonb),
    ('datetime', '"2026-09-09T12:00:00Z"'::jsonb, '9'::jsonb),
    ('select', '"A"'::jsonb, '"B"'::jsonb),
    ('multiselect', '["A"]'::jsonb, '["B"]'::jsonb),
    ('email', '"user@example.invalid"'::jsonb, 'true'::jsonb),
    ('phone', '"+5511999999999"'::jsonb, '123'::jsonb),
    ('url', '"https://example.invalid"'::jsonb, '[]'::jsonb)
  ) as samples(kind, good, bad) loop
    insert into public.custom_field_definitions(workspace_id, entity_type, key, label, field_type, options)
    values (workspace, 'contact', 'test_' || sample.kind, sample.kind, sample.kind::public.custom_field_type, '["A"]') returning id into definition;
    insert into public.custom_field_values(workspace_id, definition_id, entity_type, entity_id, value)
    values (workspace, definition, 'contact', contact, sample.good);
    -- Same path used by PostgREST merge-duplicates.
    insert into public.custom_field_values(workspace_id, definition_id, entity_type, entity_id, value)
    values (workspace, definition, 'contact', contact, sample.good)
    on conflict (workspace_id, definition_id, entity_id) do update set value = excluded.value;
    begin
      update public.custom_field_values set value = sample.bad where definition_id = definition;
      raise exception 'Invalid % accepted', sample.kind;
    exception when check_violation then null;
    end;
    begin
      update public.custom_field_values set value = 'null'::jsonb where definition_id = definition;
      raise exception 'JSON null accepted for %', sample.kind;
    exception when check_violation then null;
    end;
  end loop;
end
$test$;

set local role postgres;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $test$
declare
  workspace uuid;
  affected integer;
begin
  select id into strict workspace from public.workspaces where slug = 'metadata-types-test';
  begin
    insert into public.tags(workspace_id, name, slug) values (workspace, 'Denied', 'denied');
    raise exception 'Viewer created tag';
  exception when insufficient_privilege then null;
  end;
  update public.custom_field_values set value = '"changed"' where workspace_id = workspace;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Viewer updated fields'; end if;
  delete from public.custom_field_values where workspace_id = workspace;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Viewer deleted fields'; end if;
end
$test$;
select '13 types: insert, upsert, invalid JSON/type/options rejection; viewer writes denied' as test, true as passed;
rollback;
