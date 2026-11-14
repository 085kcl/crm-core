-- CRM Core v0.03 transactional smoke tests.
-- Exercises Contact 360, global search, RLS isolation and RPC privileges.
-- All fixtures are rolled back.

begin;

create temp table crm_v003_context (
  key text primary key,
  value uuid not null
);

create temp table crm_v003_results (
  test text primary key,
  passed boolean not null,
  detail text not null
);

grant all on table pg_temp.crm_v003_context, pg_temp.crm_v003_results to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'd1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'crm-v003-a@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Owner v0.03 A"}'::jsonb, now(), now()
  ),
  (
    'd1000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'crm-v003-b@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Owner v0.03 B"}'::jsonb, now(), now()
  );

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
set local role authenticated;

insert into pg_temp.crm_v003_context(key, value)
values ('workspace_a', public.create_workspace('CRM v003 A', 'crm-v003-a'));

insert into public.contacts(
  id, workspace_id, first_name, last_name, email, phone, whatsapp, document, owner_id
)
select
  'd2000000-0000-4000-8000-000000000001', value,
  'Mariana', 'Costa', 'mariana.v003@example.invalid', '+5511988881204',
  '+5511988881204', '12345678909', 'd1000000-0000-4000-8000-000000000001'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.companies(id, workspace_id, trade_name, legal_name, tax_id)
select
  'd3000000-0000-4000-8000-000000000001', value,
  'Grupo Atlas', 'Atlas Consultoria Ltda.', '12345678000190'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.contact_companies(workspace_id, contact_id, company_id, relationship_title, is_primary)
select value,
  'd2000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'Diretora financeira', true
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.leads(id, workspace_id, contact_id, source, score, status, qualification, owner_id)
select
  'd4000000-0000-4000-8000-000000000001', value,
  'd2000000-0000-4000-8000-000000000001', 'Site', 82, 'qualified',
  'Interesse Atlas confirmado', 'd1000000-0000-4000-8000-000000000001'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.pipelines(id, workspace_id, name, is_default)
select 'd5000000-0000-4000-8000-000000000001', value, 'Pipeline principal', true
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.pipeline_stages(id, workspace_id, pipeline_id, name, position, probability, state)
select
  'd6000000-0000-4000-8000-000000000001', value,
  'd5000000-0000-4000-8000-000000000001', 'Proposta', 0, 60, 'open'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.deals(
  id, workspace_id, pipeline_id, stage_id, title, contact_id,
  lead_id, owner_id, amount, currency, state, expected_close_date
)
select
  'd7000000-0000-4000-8000-000000000001', value,
  'd5000000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  'Diagnóstico Atlas', 'd2000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001', 84000, 'BRL', 'open', current_date + 14
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.tasks(
  id, workspace_id, title, priority, status, due_at, entity_type, entity_id, assignee_id
)
select
  'd8000000-0000-4000-8000-000000000001', value,
  'Retornar análise documental', 'high', 'open', now() - interval '1 day',
  'contact', 'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.notes(id, workspace_id, body, entity_type, entity_id)
select
  'd9000000-0000-4000-8000-000000000001', value,
  'Prefere contato após as 16h.', 'contact', 'd2000000-0000-4000-8000-000000000001'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.activities(id, workspace_id, type, entity_type, entity_id, metadata, created_at)
select
  'da000000-0000-4000-8000-000000000001'::uuid, value,
  'contact.created', 'contact', 'd2000000-0000-4000-8000-000000000001'::uuid,
  '{"title":"Contato criado"}'::jsonb, now() - interval '2 hours'
from pg_temp.crm_v003_context where key = 'workspace_a'
union all
select
  'da000000-0000-4000-8000-000000000002'::uuid, value,
  'note.created', 'contact', 'd2000000-0000-4000-8000-000000000001'::uuid,
  '{"title":"Nota adicionada"}'::jsonb, now() - interval '1 hour'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.tags(id, workspace_id, name, slug)
select 'db000000-0000-4000-8000-000000000001', value, 'Alta prioridade', 'alta-prioridade'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.entity_tags(id, workspace_id, tag_id, entity_type, entity_id)
select
  'db000000-0000-4000-8000-000000000002', value,
  'db000000-0000-4000-8000-000000000001', 'contact',
  'd2000000-0000-4000-8000-000000000001'
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.custom_field_definitions(
  id, workspace_id, entity_type, key, label, field_type, options
)
select
  'dc000000-0000-4000-8000-000000000001', value,
  'contact', 'canal_preferido', 'Canal preferido', 'select',
  '["E-mail","Telefone","WhatsApp"]'::jsonb
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into public.custom_field_values(
  id, workspace_id, definition_id, entity_type, entity_id, value
)
select
  'dc000000-0000-4000-8000-000000000002', value,
  'dc000000-0000-4000-8000-000000000001', 'contact',
  'd2000000-0000-4000-8000-000000000001', '"WhatsApp"'::jsonb
from pg_temp.crm_v003_context where key = 'workspace_a';

insert into pg_temp.crm_v003_results(test, passed, detail)
select
  'contact_360_payload_and_metrics',
  payload->'contact'->>'first_name' = 'Mariana'
    and (payload->'contact'->>'lead_count')::integer = 1
    and (payload->'contact'->>'open_deal_count')::integer = 1
    and (payload->'contact'->>'open_pipeline_value')::numeric = 84000
    and (payload->'contact'->>'open_task_count')::integer = 1
    and (payload->'contact'->>'overdue_task_count')::integer = 1
    and jsonb_array_length(payload->'companies') = 1
    and jsonb_array_length(payload->'leads') = 1
    and jsonb_array_length(payload->'deals') = 1
    and jsonb_array_length(payload->'tasks') = 1
    and jsonb_array_length(payload->'notes') = 1
    and jsonb_array_length(payload->'activities') >= 2
    and jsonb_array_length(payload->'tags') = 1
    and jsonb_array_length(payload->'custom_fields') = 1,
  payload::text
from (
  select public.get_contact_360(
    (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
    'd2000000-0000-4000-8000-000000000001',
    50
  ) as payload
) result;

insert into pg_temp.crm_v003_results(test, passed, detail)
select
  'activity_timeline_descending',
  payload->'activities'->0->>'id' = 'da000000-0000-4000-8000-000000000002',
  coalesce(payload->'activities'->0->>'id', 'missing')
from (
  select public.get_contact_360(
    (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
    'd2000000-0000-4000-8000-000000000001',
    50
  ) as payload
) result;

insert into pg_temp.crm_v003_results(test, passed, detail)
select
  'search_contact_channels',
  bool_and(found),
  string_agg(query || '=' || found::text, ', ' order by query)
from (
  select query, exists (
    select 1 from public.search_crm(
      (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
      query,
      20
    ) where entity_type = 'contact' and entity_id = 'd2000000-0000-4000-8000-000000000001'
  ) as found
  from (values ('Mariana'), ('mariana.v003@example.invalid'), ('+5511988881204'), ('12345678909')) queries(query)
) checks;

insert into pg_temp.crm_v003_results(test, passed, detail)
select
  'search_identifies_company_lead_deal',
  count(distinct entity_type) = 3,
  string_agg(distinct entity_type, ', ' order by entity_type)
from public.search_crm(
  (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
  'Atlas',
  20
)
where entity_type in ('company','lead','deal');

insert into pg_temp.crm_v003_results(test, passed, detail)
select
  'rpc_limits_and_empty_query',
  (
    select count(*) = 1
    from public.search_crm(
      (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
      'Atlas',
      1
    )
  )
  and (
    select count(*) = 0
    from public.search_crm(
      (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
      '   ',
      20
    )
  )
  and jsonb_array_length(public.get_contact_360(
    (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
    'd2000000-0000-4000-8000-000000000001',
    1
  )->'activities') = 1,
  'search limit=1, empty query=0 and activity limit=1';

set local role postgres;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
set local role authenticated;

insert into pg_temp.crm_v003_context(key, value)
values ('workspace_b', public.create_workspace('CRM v003 B', 'crm-v003-b'));

insert into pg_temp.crm_v003_results(test, passed, detail)
select
  'cross_tenant_contact_returns_null',
  public.get_contact_360(
    (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
    'd2000000-0000-4000-8000-000000000001',
    50
  ) is null,
  'foreign workspace/contact pair is indistinguishable from missing';

insert into pg_temp.crm_v003_results(test, passed, detail)
select
  'cross_tenant_search_returns_empty',
  count(*) = 0,
  format('visible_results=%s', count(*))
from public.search_crm(
  (select value from pg_temp.crm_v003_context where key = 'workspace_a'),
  'Mariana',
  20
);

set local role postgres;

insert into pg_temp.crm_v003_results(test, passed, detail)
values
  (
    'anon_cannot_execute_search',
    not has_function_privilege('anon', 'public.search_crm(uuid,text,integer)', 'execute'),
    format('anon_execute=%s', has_function_privilege('anon', 'public.search_crm(uuid,text,integer)', 'execute'))
  ),
  (
    'anon_cannot_execute_contact_360',
    not has_function_privilege('anon', 'public.get_contact_360(uuid,uuid,integer)', 'execute'),
    format('anon_execute=%s', has_function_privilege('anon', 'public.get_contact_360(uuid,uuid,integer)', 'execute'))
  );

do $test$
declare
  failures text;
begin
  select string_agg(test || ': ' || detail, E'\n' order by test)
  into failures
  from pg_temp.crm_v003_results
  where not passed;

  if failures is not null then
    raise exception 'CRM v0.03 smoke failures:%', E'\n' || failures;
  end if;
end
$test$;

select test, passed, detail
from pg_temp.crm_v003_results
order by test;

rollback;
