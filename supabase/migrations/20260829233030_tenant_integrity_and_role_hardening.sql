-- CRM Core v0.01 hardening
-- Cross-tenant referential integrity + coarse DB-level role enforcement.

-- ---------- Helper permissions ----------
create or replace function public.can_write_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_workspace_role(p_workspace_id) in (
    'owner','admin','manager','sales','marketing','finance','support'
  );
$$;

create or replace function public.can_delete_workspace_data(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_workspace_role(p_workspace_id) in ('owner','admin','manager');
$$;

grant execute on function public.can_write_workspace(uuid) to authenticated;
grant execute on function public.can_delete_workspace_data(uuid) to authenticated;

-- ---------- Prevent a workspace from losing its last active owner ----------
create or replace function public.prevent_last_workspace_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_owners integer;
begin
  if old.role = 'owner' and old.status = 'active' then
    if tg_op = 'DELETE'
       or new.role <> 'owner'
       or new.status <> 'active' then
      select count(*) into v_other_owners
      from public.workspace_members wm
      where wm.workspace_id = old.workspace_id
        and wm.user_id <> old.user_id
        and wm.role = 'owner'
        and wm.status = 'active';

      if v_other_owners = 0 then
        raise exception 'workspace_must_have_active_owner';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_workspace_owner_removal on public.workspace_members;
create trigger trg_prevent_last_workspace_owner_removal
before update or delete on public.workspace_members
for each row execute function public.prevent_last_workspace_owner_removal();

-- ---------- Harden membership management ----------
drop policy if exists workspace_members_admin_insert on public.workspace_members;
create policy workspace_members_admin_insert on public.workspace_members
for insert to authenticated
with check (
  public.current_workspace_role(workspace_id) in ('owner','admin')
  and (role <> 'owner' or public.current_workspace_role(workspace_id) = 'owner')
);

drop policy if exists workspace_members_admin_update on public.workspace_members;
create policy workspace_members_admin_update on public.workspace_members
for update to authenticated
using (
  public.current_workspace_role(workspace_id) in ('owner','admin')
  and (role <> 'owner' or public.current_workspace_role(workspace_id) = 'owner')
)
with check (
  public.current_workspace_role(workspace_id) in ('owner','admin')
  and (role <> 'owner' or public.current_workspace_role(workspace_id) = 'owner')
);

drop policy if exists workspace_members_admin_delete on public.workspace_members;
create policy workspace_members_admin_delete on public.workspace_members
for delete to authenticated
using (
  public.current_workspace_role(workspace_id) in ('owner','admin')
  and (role <> 'owner' or public.current_workspace_role(workspace_id) = 'owner')
);

-- ---------- Composite tenant keys ----------
-- These constraints allow foreign keys to include workspace_id, preventing
-- references from a row in workspace A to an entity in workspace B.
alter table public.contacts add constraint contacts_workspace_id_id_key unique (workspace_id, id);
alter table public.companies add constraint companies_workspace_id_id_key unique (workspace_id, id);
alter table public.leads add constraint leads_workspace_id_id_key unique (workspace_id, id);
alter table public.pipelines add constraint pipelines_workspace_id_id_key unique (workspace_id, id);
alter table public.pipeline_stages add constraint pipeline_stages_workspace_pipeline_id_id_key unique (workspace_id, pipeline_id, id);

-- Contact <-> Company
alter table public.contact_companies drop constraint if exists contact_companies_contact_id_fkey;
alter table public.contact_companies drop constraint if exists contact_companies_company_id_fkey;
alter table public.contact_companies
  add constraint contact_companies_workspace_contact_fkey
  foreign key (workspace_id, contact_id)
  references public.contacts(workspace_id, id) on delete cascade;
alter table public.contact_companies
  add constraint contact_companies_workspace_company_fkey
  foreign key (workspace_id, company_id)
  references public.companies(workspace_id, id) on delete cascade;

-- Lead -> Contact
alter table public.leads drop constraint if exists leads_contact_id_fkey;
alter table public.leads
  add constraint leads_workspace_contact_fkey
  foreign key (workspace_id, contact_id)
  references public.contacts(workspace_id, id) on delete restrict;

-- Stage -> Pipeline
alter table public.pipeline_stages drop constraint if exists pipeline_stages_pipeline_id_fkey;
alter table public.pipeline_stages
  add constraint pipeline_stages_workspace_pipeline_fkey
  foreign key (workspace_id, pipeline_id)
  references public.pipelines(workspace_id, id) on delete cascade;

-- Deal -> Pipeline / Stage / Contact / Company / Lead
alter table public.deals drop constraint if exists deals_pipeline_id_fkey;
alter table public.deals drop constraint if exists deals_stage_id_fkey;
alter table public.deals drop constraint if exists deals_contact_id_fkey;
alter table public.deals drop constraint if exists deals_company_id_fkey;
alter table public.deals drop constraint if exists deals_lead_id_fkey;

alter table public.deals
  add constraint deals_workspace_pipeline_fkey
  foreign key (workspace_id, pipeline_id)
  references public.pipelines(workspace_id, id) on delete restrict;

alter table public.deals
  add constraint deals_workspace_pipeline_stage_fkey
  foreign key (workspace_id, pipeline_id, stage_id)
  references public.pipeline_stages(workspace_id, pipeline_id, id) on delete restrict;

alter table public.deals
  add constraint deals_workspace_contact_fkey
  foreign key (workspace_id, contact_id)
  references public.contacts(workspace_id, id) on delete restrict;

alter table public.deals
  add constraint deals_workspace_company_fkey
  foreign key (workspace_id, company_id)
  references public.companies(workspace_id, id) on delete restrict;

alter table public.deals
  add constraint deals_workspace_lead_fkey
  foreign key (workspace_id, lead_id)
  references public.leads(workspace_id, id) on delete restrict;

-- Assignees/owners must be members of the same workspace when populated.
alter table public.contacts drop constraint if exists contacts_owner_id_fkey;
alter table public.contacts
  add constraint contacts_workspace_owner_fkey
  foreign key (workspace_id, owner_id)
  references public.workspace_members(workspace_id, user_id) on delete restrict;

alter table public.companies drop constraint if exists companies_owner_id_fkey;
alter table public.companies
  add constraint companies_workspace_owner_fkey
  foreign key (workspace_id, owner_id)
  references public.workspace_members(workspace_id, user_id) on delete restrict;

alter table public.leads drop constraint if exists leads_owner_id_fkey;
alter table public.leads
  add constraint leads_workspace_owner_fkey
  foreign key (workspace_id, owner_id)
  references public.workspace_members(workspace_id, user_id) on delete restrict;

alter table public.deals drop constraint if exists deals_owner_id_fkey;
alter table public.deals
  add constraint deals_workspace_owner_fkey
  foreign key (workspace_id, owner_id)
  references public.workspace_members(workspace_id, user_id) on delete restrict;

alter table public.tasks drop constraint if exists tasks_assignee_id_fkey;
alter table public.tasks
  add constraint tasks_workspace_assignee_fkey
  foreign key (workspace_id, assignee_id)
  references public.workspace_members(workspace_id, user_id) on delete restrict;

-- ---------- Coarse DB-level RBAC ----------
-- All active members may read tenant data.
-- Viewer is read-only.
-- Destructive operations are limited to owner/admin/manager.
do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts','companies','contact_companies','leads','pipelines','pipeline_stages',
    'deals','tasks','notes','activities'
  ] loop
    execute format('drop policy if exists %I_tenant_insert on public.%I', t, t);
    execute format('create policy %I_tenant_insert on public.%I for insert to authenticated with check (public.can_write_workspace(workspace_id))', t, t);

    execute format('drop policy if exists %I_tenant_update on public.%I', t, t);
    execute format('create policy %I_tenant_update on public.%I for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id))', t, t);

    execute format('drop policy if exists %I_tenant_delete on public.%I', t, t);
    execute format('create policy %I_tenant_delete on public.%I for delete to authenticated using (public.can_delete_workspace_data(workspace_id))', t, t);
  end loop;
end $$;

-- Audit logs contain administrative/security information: owner/admin only.
drop policy if exists audit_member_select on public.audit_logs;
create policy audit_admin_select on public.audit_logs
for select to authenticated
using (public.current_workspace_role(workspace_id) in ('owner','admin'));

-- ---------- Cross-tenant invariant notes ----------
-- Polymorphic references in tasks/notes/activities (entity_type/entity_id) cannot
-- be protected with a normal FK. Application services must validate that the
-- target entity belongs to the active workspace before insert/update.
