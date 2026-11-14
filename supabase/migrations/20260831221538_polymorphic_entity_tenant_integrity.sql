create or replace function private.entity_belongs_to_workspace(
  p_entity_type text,
  p_entity_id uuid,
  p_workspace_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text := lower(trim(p_entity_type));
  v_exists boolean := false;
begin
  if p_entity_type is null or p_entity_id is null or p_workspace_id is null then
    return false;
  end if;

  case v_type
    when 'contact' then
      select exists(select 1 from public.contacts where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'contacts' then
      select exists(select 1 from public.contacts where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'company' then
      select exists(select 1 from public.companies where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'companies' then
      select exists(select 1 from public.companies where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'lead' then
      select exists(select 1 from public.leads where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'leads' then
      select exists(select 1 from public.leads where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'deal' then
      select exists(select 1 from public.deals where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'deals' then
      select exists(select 1 from public.deals where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'task' then
      select exists(select 1 from public.tasks where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'tasks' then
      select exists(select 1 from public.tasks where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'note' then
      select exists(select 1 from public.notes where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'notes' then
      select exists(select 1 from public.notes where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'pipeline' then
      select exists(select 1 from public.pipelines where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'pipelines' then
      select exists(select 1 from public.pipelines where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'pipeline_stage' then
      select exists(select 1 from public.pipeline_stages where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'stage' then
      select exists(select 1 from public.pipeline_stages where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'workspace' then
      v_exists := (p_entity_id = p_workspace_id) and exists(select 1 from public.workspaces where id=p_workspace_id);
    else
      return false;
  end case;

  return v_exists;
end;
$$;

create or replace function private.validate_polymorphic_entity_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entity_type is null and new.entity_id is null then
    return new;
  end if;

  if new.entity_type is null or new.entity_id is null then
    raise exception 'entity_type_and_entity_id_must_be_set_together'
      using errcode = '23514';
  end if;

  if not private.entity_belongs_to_workspace(new.entity_type, new.entity_id, new.workspace_id) then
    raise exception 'entity_reference_not_found_in_workspace'
      using errcode = '23503';
  end if;

  new.entity_type := lower(trim(new.entity_type));
  return new;
end;
$$;

revoke all on function private.entity_belongs_to_workspace(text,uuid,uuid) from public, anon, authenticated;
revoke all on function private.validate_polymorphic_entity_reference() from public, anon, authenticated;

drop trigger if exists trg_tasks_entity_tenant_integrity on public.tasks;
create trigger trg_tasks_entity_tenant_integrity
before insert or update of workspace_id, entity_type, entity_id on public.tasks
for each row execute function private.validate_polymorphic_entity_reference();

drop trigger if exists trg_notes_entity_tenant_integrity on public.notes;
create trigger trg_notes_entity_tenant_integrity
before insert or update of workspace_id, entity_type, entity_id on public.notes
for each row execute function private.validate_polymorphic_entity_reference();

drop trigger if exists trg_activities_entity_tenant_integrity on public.activities;
create trigger trg_activities_entity_tenant_integrity
before insert or update of workspace_id, entity_type, entity_id on public.activities
for each row execute function private.validate_polymorphic_entity_reference();
