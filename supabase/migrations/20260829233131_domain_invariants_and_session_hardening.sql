-- CRM Core v0.01 hardening II
-- Domain invariants, trustworthy actor fields, shared profile visibility and immutable activities.

-- ---------- Safe profile visibility inside shared workspaces ----------
create or replace function public.shares_active_workspace(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
     and theirs.status = 'active'
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = p_user_id
  );
$$;

revoke all on function public.shares_active_workspace(uuid) from public;
grant execute on function public.shares_active_workspace(uuid) to authenticated;

drop policy if exists profiles_shared_workspace_select on public.profiles;
create policy profiles_shared_workspace_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.shares_active_workspace(id));

-- ---------- Prevent client-side actor spoofing ----------
create or replace function public.stamp_crm_actor_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create or replace function public.stamp_crm_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

create or replace function public.stamp_activity_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.actor_id := coalesce(auth.uid(), new.actor_id);
  return new;
end;
$$;

revoke all on function public.stamp_crm_actor_fields() from public;
revoke all on function public.stamp_crm_creator() from public;
revoke all on function public.stamp_activity_actor() from public;

do $$
declare
  t text;
begin
  foreach t in array array['contacts','companies','leads','deals','tasks'] loop
    execute format('drop trigger if exists trg_%I_actor_fields on public.%I', t, t);
    execute format(
      'create trigger trg_%I_actor_fields before insert or update on public.%I for each row execute function public.stamp_crm_actor_fields()',
      t,
      t
    );
  end loop;
end $$;

drop trigger if exists trg_pipelines_creator on public.pipelines;
create trigger trg_pipelines_creator
before insert on public.pipelines
for each row execute function public.stamp_crm_creator();

drop trigger if exists trg_notes_creator on public.notes;
create trigger trg_notes_creator
before insert on public.notes
for each row execute function public.stamp_crm_creator();

drop trigger if exists trg_activities_actor on public.activities;
create trigger trg_activities_actor
before insert on public.activities
for each row execute function public.stamp_activity_actor();

-- ---------- Assignees and owners must be active workspace members ----------
create or replace function public.ensure_active_workspace_member_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field_name text := tg_argv[0];
  v_user_id uuid;
begin
  v_user_id := nullif(to_jsonb(new) ->> v_field_name, '')::uuid;
  if v_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = new.workspace_id
      and wm.user_id = v_user_id
      and wm.status = 'active'
  ) then
    raise exception 'assignee_or_owner_must_be_active_workspace_member'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_active_workspace_member_reference() from public;

do $$
declare
  t text;
begin
  foreach t in array array['contacts','companies','leads','deals'] loop
    execute format('drop trigger if exists trg_%I_active_owner on public.%I', t, t);
    execute format(
      'create trigger trg_%I_active_owner before insert or update on public.%I for each row execute function public.ensure_active_workspace_member_reference(''owner_id'')',
      t,
      t
    );
  end loop;
end $$;

drop trigger if exists trg_tasks_active_assignee on public.tasks;
create trigger trg_tasks_active_assignee
before insert or update on public.tasks
for each row execute function public.ensure_active_workspace_member_reference('assignee_id');

drop trigger if exists trg_activities_active_actor on public.activities;
create trigger trg_activities_active_actor
before insert or update on public.activities
for each row execute function public.ensure_active_workspace_member_reference('actor_id');

-- ---------- Deal stage is the source of truth for deal state ----------
create or replace function public.sync_deal_state_from_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_state public.deal_state;
begin
  select ps.state into v_stage_state
  from public.pipeline_stages ps
  where ps.workspace_id = new.workspace_id
    and ps.pipeline_id = new.pipeline_id
    and ps.id = new.stage_id;

  if v_stage_state is null then
    raise exception 'deal_stage_not_found_in_workspace_pipeline'
      using errcode = '23503';
  end if;

  new.state := v_stage_state;
  if v_stage_state = 'open' then
    new.closed_at := null;
    new.lost_reason := null;
  else
    new.closed_at := coalesce(new.closed_at, now());
    if v_stage_state <> 'lost' then
      new.lost_reason := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.record_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stage_id is distinct from new.stage_id then
    insert into public.activities(
      workspace_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      metadata
    ) values (
      new.workspace_id,
      auth.uid(),
      'deal.stage_changed',
      'deal',
      new.id,
      jsonb_build_object(
        'from_stage_id', old.stage_id,
        'to_stage_id', new.stage_id,
        'from_state', old.state,
        'to_state', new.state
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.sync_deal_state_from_stage() from public;
revoke all on function public.record_deal_stage_change() from public;

drop trigger if exists trg_deals_sync_stage_state on public.deals;
create trigger trg_deals_sync_stage_state
before insert or update on public.deals
for each row execute function public.sync_deal_state_from_stage();

drop trigger if exists trg_deals_stage_activity on public.deals;
create trigger trg_deals_stage_activity
after update of stage_id on public.deals
for each row execute function public.record_deal_stage_change();

-- ---------- Lifecycle timestamps ----------
create or replace function public.sync_task_completion_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.sync_lead_conversion_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'converted' then
    new.converted_at := coalesce(new.converted_at, now());
  elsif new.status <> 'archived' then
    new.converted_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_task_completion_timestamp() from public;
revoke all on function public.sync_lead_conversion_timestamp() from public;

drop trigger if exists trg_tasks_completion_timestamp on public.tasks;
create trigger trg_tasks_completion_timestamp
before insert or update of status on public.tasks
for each row execute function public.sync_task_completion_timestamp();

drop trigger if exists trg_leads_conversion_timestamp on public.leads;
create trigger trg_leads_conversion_timestamp
before insert or update of status on public.leads
for each row execute function public.sync_lead_conversion_timestamp();

-- ---------- Configurational uniqueness ----------
create unique index if not exists uq_contact_primary_company
on public.contact_companies(workspace_id, contact_id)
where is_primary;

create unique index if not exists uq_workspace_active_default_pipeline
on public.pipelines(workspace_id)
where is_default and status = 'active';

-- Commercial history is append-only to authenticated clients.
drop policy if exists activities_tenant_update on public.activities;
drop policy if exists activities_tenant_delete on public.activities;
