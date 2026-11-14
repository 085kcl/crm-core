-- CRM Core v0.02 performance hardening
-- Cover foreign keys and avoid per-row auth.uid() evaluation in profile RLS.

-- Foreign-key indexes improve joins and prevent full scans during parent-row
-- updates/deletes. Composite indexes follow the exact FK column order.
create index if not exists idx_activities_actor
  on public.activities(actor_id);
create index if not exists idx_audit_logs_user
  on public.audit_logs(user_id);

create index if not exists idx_companies_created_by
  on public.companies(created_by);
create index if not exists idx_companies_updated_by
  on public.companies(updated_by);
create index if not exists idx_companies_workspace_owner
  on public.companies(workspace_id, owner_id);

create index if not exists idx_contacts_created_by
  on public.contacts(created_by);
create index if not exists idx_contacts_updated_by
  on public.contacts(updated_by);
create index if not exists idx_contacts_workspace_owner
  on public.contacts(workspace_id, owner_id);

create index if not exists idx_deals_created_by
  on public.deals(created_by);
create index if not exists idx_deals_updated_by
  on public.deals(updated_by);
create index if not exists idx_deals_workspace_company
  on public.deals(workspace_id, company_id);
create index if not exists idx_deals_workspace_contact
  on public.deals(workspace_id, contact_id);
create index if not exists idx_deals_workspace_lead
  on public.deals(workspace_id, lead_id);

create index if not exists idx_leads_created_by
  on public.leads(created_by);
create index if not exists idx_leads_updated_by
  on public.leads(updated_by);
create index if not exists idx_leads_workspace_owner
  on public.leads(workspace_id, owner_id);

create index if not exists idx_notes_created_by
  on public.notes(created_by);
create index if not exists idx_outbox_events_workspace
  on public.outbox_events(workspace_id);
create index if not exists idx_pipelines_created_by
  on public.pipelines(created_by);
create index if not exists idx_tasks_created_by
  on public.tasks(created_by);
create index if not exists idx_tasks_updated_by
  on public.tasks(updated_by);
create index if not exists idx_workspaces_created_by
  on public.workspaces(created_by);

-- One SELECT policy is enough: the user sees their own profile and profiles
-- belonging to users who share an active workspace. auth.uid() is evaluated
-- once per statement instead of once per row.
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_shared_workspace_select on public.profiles;
drop policy if exists profiles_workspace_select on public.profiles;
create policy profiles_workspace_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or private.shares_active_workspace(id)
);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));
