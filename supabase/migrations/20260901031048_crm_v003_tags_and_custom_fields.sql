create type public.custom_field_type as enum (
  'text','textarea','integer','decimal','currency','boolean','date','datetime','select','multiselect','email','phone','url'
);

create or replace function private.can_manage_workspace_configuration(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_workspace_role(p_workspace_id) in ('owner','admin','manager');
$$;

revoke all on function private.can_manage_workspace_configuration(uuid) from public, anon;
grant execute on function private.can_manage_workspace_configuration(uuid) to authenticated, service_role;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_name_check check (char_length(trim(name)) between 1 and 80),
  constraint tags_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$' or slug ~ '^[a-z0-9]$'),
  constraint tags_workspace_id_id_key unique (workspace_id, id),
  constraint tags_workspace_slug_key unique (workspace_id, slug)
);

create table public.entity_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tag_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint entity_tags_workspace_tag_fkey foreign key (workspace_id, tag_id)
    references public.tags(workspace_id, id) on delete cascade,
  constraint entity_tags_entity_type_check check (entity_type in ('contact','company','lead','deal','task','note','pipeline','pipeline_stage','workspace')),
  constraint entity_tags_unique_assignment unique (workspace_id, tag_id, entity_type, entity_id)
);

create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  key text not null,
  label text not null,
  field_type public.custom_field_type not null,
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  position integer not null default 0,
  status public.record_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_field_definitions_entity_type_check check (entity_type in ('contact','company','lead','deal')),
  constraint custom_field_definitions_key_check check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint custom_field_definitions_label_check check (char_length(trim(label)) between 1 and 120),
  constraint custom_field_definitions_position_check check (position >= 0),
  constraint custom_field_definitions_options_array_check check (jsonb_typeof(options) = 'array'),
  constraint custom_field_definitions_workspace_id_id_key unique (workspace_id, id),
  constraint custom_field_definitions_workspace_entity_key unique (workspace_id, entity_type, key)
);

create table public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  definition_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  value jsonb not null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_field_values_workspace_definition_fkey foreign key (workspace_id, definition_id)
    references public.custom_field_definitions(workspace_id, id) on delete cascade,
  constraint custom_field_values_unique_value unique (workspace_id, definition_id, entity_id)
);

create or replace function private.validate_tag_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.entity_type := lower(trim(new.entity_type));
  if not private.entity_belongs_to_workspace(new.entity_type, new.entity_id, new.workspace_id) then
    raise exception 'entity_reference_not_found_in_workspace' using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function private.validate_custom_field_value()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def public.custom_field_definitions%rowtype;
  v_json_type text;
  v_item text;
begin
  new.entity_type := lower(trim(new.entity_type));

  select * into v_def
  from public.custom_field_definitions
  where id = new.definition_id
    and workspace_id = new.workspace_id
    and status = 'active';

  if not found then
    raise exception 'custom_field_definition_not_found_in_workspace' using errcode = '23503';
  end if;

  if v_def.entity_type <> new.entity_type then
    raise exception 'custom_field_entity_type_mismatch' using errcode = '23514';
  end if;

  if not private.entity_belongs_to_workspace(new.entity_type, new.entity_id, new.workspace_id) then
    raise exception 'entity_reference_not_found_in_workspace' using errcode = '23503';
  end if;

  if new.value = 'null'::jsonb then
    raise exception 'custom_field_value_cannot_be_json_null' using errcode = '23514';
  end if;

  v_json_type := jsonb_typeof(new.value);

  case v_def.field_type
    when 'text', 'textarea', 'email', 'phone', 'url', 'date', 'datetime', 'select' then
      if v_json_type <> 'string' then
        raise exception 'custom_field_value_must_be_string' using errcode = '23514';
      end if;
    when 'integer', 'decimal', 'currency' then
      if v_json_type <> 'number' then
        raise exception 'custom_field_value_must_be_number' using errcode = '23514';
      end if;
      if v_def.field_type = 'integer' and (new.value #>> '{}')::numeric <> trunc((new.value #>> '{}')::numeric) then
        raise exception 'custom_field_integer_must_be_integral' using errcode = '23514';
      end if;
    when 'boolean' then
      if v_json_type <> 'boolean' then
        raise exception 'custom_field_value_must_be_boolean' using errcode = '23514';
      end if;
    when 'multiselect' then
      if v_json_type <> 'array' then
        raise exception 'custom_field_value_must_be_array' using errcode = '23514';
      end if;
      if exists (select 1 from jsonb_array_elements(new.value) e where jsonb_typeof(e) <> 'string') then
        raise exception 'custom_field_multiselect_items_must_be_strings' using errcode = '23514';
      end if;
  end case;

  if v_def.field_type = 'select' and jsonb_array_length(v_def.options) > 0 then
    v_item := new.value #>> '{}';
    if not exists (select 1 from jsonb_array_elements_text(v_def.options) o where o = v_item) then
      raise exception 'custom_field_select_value_not_in_options' using errcode = '23514';
    end if;
  end if;

  if v_def.field_type = 'multiselect' and jsonb_array_length(v_def.options) > 0 then
    if exists (
      select 1
      from jsonb_array_elements_text(new.value) selected
      where not exists (
        select 1 from jsonb_array_elements_text(v_def.options) allowed where allowed = selected
      )
    ) then
      raise exception 'custom_field_multiselect_value_not_in_options' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_tag_assignment() from public, anon, authenticated;
grant execute on function private.validate_tag_assignment() to service_role;
revoke all on function private.validate_custom_field_value() from public, anon, authenticated;
grant execute on function private.validate_custom_field_value() to service_role;

create trigger trg_tags_creator before insert on public.tags
for each row execute function private.stamp_crm_creator();
create trigger trg_tags_updated_at before update on public.tags
for each row execute function public.set_updated_at();
create trigger trg_tags_audit after insert or update or delete on public.tags
for each row execute function private.audit_tenant_row_change();

create trigger trg_entity_tags_creator before insert on public.entity_tags
for each row execute function private.stamp_crm_creator();
create trigger trg_entity_tags_validate before insert or update on public.entity_tags
for each row execute function private.validate_tag_assignment();
create trigger trg_entity_tags_audit after insert or delete on public.entity_tags
for each row execute function private.audit_tenant_row_change();

create trigger trg_custom_field_definitions_creator before insert on public.custom_field_definitions
for each row execute function private.stamp_crm_creator();
create trigger trg_custom_field_definitions_updated_at before update on public.custom_field_definitions
for each row execute function public.set_updated_at();
create trigger trg_custom_field_definitions_audit after insert or update or delete on public.custom_field_definitions
for each row execute function private.audit_tenant_row_change();

create trigger trg_custom_field_values_actor_fields before insert or update on public.custom_field_values
for each row execute function private.stamp_crm_actor_fields();
create trigger trg_custom_field_values_updated_at before update on public.custom_field_values
for each row execute function public.set_updated_at();
create trigger trg_custom_field_values_validate before insert or update on public.custom_field_values
for each row execute function private.validate_custom_field_value();
create trigger trg_custom_field_values_audit after insert or update or delete on public.custom_field_values
for each row execute function private.audit_tenant_row_change();

create index idx_tags_workspace_name on public.tags(workspace_id, name);
create index idx_entity_tags_entity on public.entity_tags(workspace_id, entity_type, entity_id);
create index idx_entity_tags_tag on public.entity_tags(workspace_id, tag_id);
create index idx_custom_field_definitions_workspace_entity on public.custom_field_definitions(workspace_id, entity_type, status, position);
create index idx_custom_field_values_entity on public.custom_field_values(workspace_id, entity_type, entity_id);
create index idx_custom_field_values_definition on public.custom_field_values(workspace_id, definition_id);

alter table public.tags enable row level security;
alter table public.entity_tags enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;

create policy tags_select on public.tags for select to authenticated
using (private.is_workspace_member(workspace_id));
create policy tags_insert on public.tags for insert to authenticated
with check (private.can_manage_workspace_configuration(workspace_id));
create policy tags_update on public.tags for update to authenticated
using (private.can_manage_workspace_configuration(workspace_id))
with check (private.can_manage_workspace_configuration(workspace_id));
create policy tags_delete on public.tags for delete to authenticated
using (private.can_manage_workspace_configuration(workspace_id));

create policy entity_tags_select on public.entity_tags for select to authenticated
using (private.is_workspace_member(workspace_id));
create policy entity_tags_insert on public.entity_tags for insert to authenticated
with check (private.can_write_workspace(workspace_id));
create policy entity_tags_delete on public.entity_tags for delete to authenticated
using (private.can_write_workspace(workspace_id));

create policy custom_field_definitions_select on public.custom_field_definitions for select to authenticated
using (private.is_workspace_member(workspace_id));
create policy custom_field_definitions_insert on public.custom_field_definitions for insert to authenticated
with check (private.can_manage_workspace_configuration(workspace_id));
create policy custom_field_definitions_update on public.custom_field_definitions for update to authenticated
using (private.can_manage_workspace_configuration(workspace_id))
with check (private.can_manage_workspace_configuration(workspace_id));
create policy custom_field_definitions_delete on public.custom_field_definitions for delete to authenticated
using (private.can_manage_workspace_configuration(workspace_id));

create policy custom_field_values_select on public.custom_field_values for select to authenticated
using (private.is_workspace_member(workspace_id));
create policy custom_field_values_insert on public.custom_field_values for insert to authenticated
with check (private.can_write_workspace(workspace_id));
create policy custom_field_values_update on public.custom_field_values for update to authenticated
using (private.can_write_workspace(workspace_id))
with check (private.can_write_workspace(workspace_id));
create policy custom_field_values_delete on public.custom_field_values for delete to authenticated
using (private.can_write_workspace(workspace_id));

revoke all on public.tags, public.entity_tags, public.custom_field_definitions, public.custom_field_values from anon;
grant select, insert, update, delete on public.tags to authenticated, service_role;
grant select, insert, delete on public.entity_tags to authenticated, service_role;
grant select, insert, update, delete on public.custom_field_definitions to authenticated, service_role;
grant select, insert, update, delete on public.custom_field_values to authenticated, service_role;
