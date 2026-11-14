-- CRM Core v0.01 database audit
-- Generates audit rows inside PostgreSQL, independent of frontend behavior.

create or replace function public.audit_tenant_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_resource_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_workspace_id := new.workspace_id;
    v_resource_id := new.id;
    v_before := null;
    v_after := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_workspace_id := new.workspace_id;
    v_resource_id := new.id;
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  else
    v_workspace_id := old.workspace_id;
    v_resource_id := old.id;
    v_before := to_jsonb(old);
    v_after := null;
  end if;

  insert into public.audit_logs(
    workspace_id,
    user_id,
    action,
    resource_type,
    resource_id,
    before_data,
    after_data
  ) values (
    v_workspace_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_resource_id,
    v_before,
    v_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Do not make trigger functions part of the public callable API.
revoke all on function public.audit_tenant_row_change() from public;

-- Attach only to important business entities in v0.01.
do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts','companies','leads','pipelines','pipeline_stages','deals','tasks','notes'
  ] loop
    execute format('drop trigger if exists trg_%I_audit on public.%I', t, t);
    execute format(
      'create trigger trg_%I_audit after insert or update or delete on public.%I for each row execute function public.audit_tenant_row_change()',
      t, t
    );
  end loop;
end $$;

-- Security-definer RPC/function hardening.
revoke all on function public.create_workspace(text, text) from public;
revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.current_workspace_role(uuid) from public;
revoke all on function public.can_write_workspace(uuid) from public;
revoke all on function public.can_delete_workspace_data(uuid) from public;
revoke all on function public.prevent_last_workspace_owner_removal() from public;
revoke all on function public.handle_new_user() from public;

grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.current_workspace_role(uuid) to authenticated;
grant execute on function public.can_write_workspace(uuid) to authenticated;
grant execute on function public.can_delete_workspace_data(uuid) to authenticated;
