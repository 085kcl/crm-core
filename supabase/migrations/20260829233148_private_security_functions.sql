-- CRM Core v0.02 hardening III
-- Keeps the intentionally exposed create_workspace RPC in public and moves
-- internal SECURITY DEFINER / trigger helpers out of the Data API schema.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Policies and triggers depend on function OIDs, so PostgreSQL preserves their
-- bindings when these functions move to the private schema.
alter function public.is_workspace_member(uuid) set schema private;
alter function public.current_workspace_role(uuid) set schema private;
alter function public.can_write_workspace(uuid) set schema private;
alter function public.can_delete_workspace_data(uuid) set schema private;
alter function public.prevent_last_workspace_owner_removal() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.audit_tenant_row_change() set schema private;
alter function public.shares_active_workspace(uuid) set schema private;
alter function public.stamp_crm_actor_fields() set schema private;
alter function public.stamp_crm_creator() set schema private;
alter function public.stamp_activity_actor() set schema private;
alter function public.ensure_active_workspace_member_reference() set schema private;
alter function public.sync_deal_state_from_stage() set schema private;
alter function public.record_deal_stage_change() set schema private;
alter function public.sync_task_completion_timestamp() set schema private;
alter function public.sync_lead_conversion_timestamp() set schema private;

-- SQL-language helpers that called another helper by its former public name
-- are rewritten after the schema move.
create or replace function private.can_write_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_workspace_role(p_workspace_id) in (
    'owner','admin','manager','sales','marketing','finance','support'
  );
$$;

create or replace function private.can_delete_workspace_data(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_workspace_role(p_workspace_id) in ('owner','admin','manager');
$$;

-- Pin every privileged internal function to an empty search path. All object
-- names inside their bodies are already schema-qualified.
alter function private.is_workspace_member(uuid) set search_path to '';
alter function private.current_workspace_role(uuid) set search_path to '';
alter function private.prevent_last_workspace_owner_removal() set search_path to '';
alter function private.handle_new_user() set search_path to '';
alter function private.audit_tenant_row_change() set search_path to '';
alter function private.shares_active_workspace(uuid) set search_path to '';
alter function private.stamp_crm_actor_fields() set search_path to '';
alter function private.stamp_crm_creator() set search_path to '';
alter function private.stamp_activity_actor() set search_path to '';
alter function private.ensure_active_workspace_member_reference() set search_path to '';
alter function private.sync_deal_state_from_stage() set search_path to '';
alter function private.record_deal_stage_change() set search_path to '';
alter function private.sync_task_completion_timestamp() set search_path to '';
alter function private.sync_lead_conversion_timestamp() set search_path to '';

-- Recreate the one intended public RPC with an empty search path and fully
-- qualified objects. It remains callable only by authenticated users.
create or replace function public.create_workspace(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  insert into public.workspaces(name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), auth.uid())
  returning id into v_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace_id, auth.uid(), 'owner');

  return v_workspace_id;
end;
$$;

revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;

revoke all on all functions in schema private from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.current_workspace_role(uuid) to authenticated;
grant execute on function private.can_write_workspace(uuid) to authenticated;
grant execute on function private.can_delete_workspace_data(uuid) to authenticated;
grant execute on function private.shares_active_workspace(uuid) to authenticated;
