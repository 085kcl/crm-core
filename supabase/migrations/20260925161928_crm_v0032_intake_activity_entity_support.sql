-- CRM Core v0.03.2 — allow Intake as a first-class polymorphic CRM entity.
-- Additive extension of the existing tenant-integrity validator.

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
    when 'intake_request' then
      select exists(select 1 from public.intake_requests where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'intake_requests' then
      select exists(select 1 from public.intake_requests where id=p_entity_id and workspace_id=p_workspace_id) into v_exists;
    when 'workspace' then
      v_exists := (p_entity_id = p_workspace_id)
        and exists(select 1 from public.workspaces where id=p_workspace_id);
    else
      return false;
  end case;

  return v_exists;
end;
$$;

revoke all on function private.entity_belongs_to_workspace(text,uuid,uuid)
from public, anon;
grant execute on function private.entity_belongs_to_workspace(text,uuid,uuid)
to authenticated, service_role;
