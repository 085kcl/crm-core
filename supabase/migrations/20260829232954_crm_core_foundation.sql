-- CRM Core v0.01
-- Supabase/PostgreSQL foundation

create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$ begin
  create type public.workspace_role as enum (
    'owner','admin','manager','sales','marketing','finance','support','viewer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.record_status as enum ('active','inactive','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum ('new','working','qualified','unqualified','converted','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.deal_state as enum ('open','won','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('open','in_progress','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

-- ---------- Common trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Identity / tenancy ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  status public.record_status not null default 'active',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'viewer',
  status public.record_status not null default 'active',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user on public.workspace_members(user_id, workspace_id);

-- SECURITY DEFINER is intentional: membership checks must work even with RLS on workspace_members.
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function public.current_workspace_role(p_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid()
    and wm.status = 'active'
  limit 1;
$$;

-- Atomic workspace creation + owner membership.
create or replace function public.create_workspace(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
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

-- ---------- CRM core ----------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  whatsapp text,
  document text,
  birth_date date,
  status public.record_status not null default 'active',
  owner_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_workspace_created on public.contacts(workspace_id, created_at desc);
create index if not exists idx_contacts_workspace_email on public.contacts(workspace_id, lower(email));
create index if not exists idx_contacts_workspace_phone on public.contacts(workspace_id, phone);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legal_name text,
  trade_name text not null,
  tax_id text,
  website text,
  segment text,
  status public.record_status not null default 'active',
  owner_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_companies_workspace_name on public.companies(workspace_id, trade_name);
create index if not exists idx_companies_workspace_tax on public.companies(workspace_id, tax_id);

create table if not exists public.contact_companies (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  relationship_title text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (contact_id, company_id)
);
create index if not exists idx_contact_companies_workspace on public.contact_companies(workspace_id, company_id);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  source text,
  owner_id uuid references auth.users(id),
  score smallint not null default 0 check (score between 0 and 100),
  status public.lead_status not null default 'new',
  qualification text,
  converted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_workspace_status on public.leads(workspace_id, status, created_at desc);
create index if not exists idx_leads_workspace_contact on public.leads(workspace_id, contact_id);

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  status public.record_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists idx_pipelines_workspace on public.pipelines(workspace_id, status);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position integer not null check (position >= 0),
  probability smallint not null default 0 check (probability between 0 and 100),
  state public.deal_state not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, position),
  unique (pipeline_id, name)
);
create index if not exists idx_stages_pipeline_position on public.pipeline_stages(workspace_id, pipeline_id, position);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  title text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  owner_id uuid references auth.users(id),
  amount numeric(18,2) check (amount is null or amount >= 0),
  currency char(3) not null default 'BRL',
  state public.deal_state not null default 'open',
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_deals_workspace_pipeline_stage on public.deals(workspace_id, pipeline_id, stage_id);
create index if not exists idx_deals_workspace_owner on public.deals(workspace_id, owner_id, state);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references auth.users(id),
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  due_at timestamptz,
  completed_at timestamptz,
  entity_type text,
  entity_id uuid,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_workspace_assignee_due on public.tasks(workspace_id, assignee_id, due_at);
create index if not exists idx_tasks_workspace_entity on public.tasks(workspace_id, entity_type, entity_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  body text not null,
  entity_type text not null,
  entity_id uuid not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notes_workspace_entity on public.notes(workspace_id, entity_type, entity_id, created_at desc);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id),
  type text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_workspace_entity on public.activities(workspace_id, entity_type, entity_id, created_at desc);
create index if not exists idx_activities_workspace_created on public.activities(workspace_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_workspace_resource on public.audit_logs(workspace_id, resource_type, resource_id, created_at desc);

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_outbox_pending on public.outbox_events(processed_at, available_at) where processed_at is null;

-- ---------- updated_at triggers ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','workspaces','contacts','companies','leads','pipelines',
    'pipeline_stages','deals','tasks','notes'
  ] loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.contacts enable row level security;
alter table public.companies enable row level security;
alter table public.contact_companies enable row level security;
alter table public.leads enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.activities enable row level security;
alter table public.audit_logs enable row level security;
alter table public.outbox_events enable row level security;

-- Profiles: self only in v0.01.
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert to authenticated
with check (id = auth.uid());

-- Workspace read is membership-based. Creation should use create_workspace().
drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists workspaces_member_update on public.workspaces;
create policy workspaces_member_update on public.workspaces for update to authenticated
using (public.current_workspace_role(id) in ('owner','admin'))
with check (public.current_workspace_role(id) in ('owner','admin'));

-- Members: members can read roster; owners/admins manage membership.
drop policy if exists workspace_members_member_select on public.workspace_members;
create policy workspace_members_member_select on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_admin_insert on public.workspace_members;
create policy workspace_members_admin_insert on public.workspace_members for insert to authenticated
with check (public.current_workspace_role(workspace_id) in ('owner','admin'));

drop policy if exists workspace_members_admin_update on public.workspace_members;
create policy workspace_members_admin_update on public.workspace_members for update to authenticated
using (public.current_workspace_role(workspace_id) in ('owner','admin'))
with check (public.current_workspace_role(workspace_id) in ('owner','admin'));

drop policy if exists workspace_members_admin_delete on public.workspace_members;
create policy workspace_members_admin_delete on public.workspace_members for delete to authenticated
using (public.current_workspace_role(workspace_id) in ('owner','admin'));

-- Generic tenant policies for operational tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts','companies','contact_companies','leads','pipelines','pipeline_stages',
    'deals','tasks','notes','activities'
  ] loop
    execute format('drop policy if exists %I_tenant_select on public.%I', t, t);
    execute format('create policy %I_tenant_select on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', t, t);

    execute format('drop policy if exists %I_tenant_insert on public.%I', t, t);
    execute format('create policy %I_tenant_insert on public.%I for insert to authenticated with check (public.is_workspace_member(workspace_id))', t, t);

    execute format('drop policy if exists %I_tenant_update on public.%I', t, t);
    execute format('create policy %I_tenant_update on public.%I for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', t, t);

    execute format('drop policy if exists %I_tenant_delete on public.%I', t, t);
    execute format('create policy %I_tenant_delete on public.%I for delete to authenticated using (public.is_workspace_member(workspace_id))', t, t);
  end loop;
end $$;

-- Audit: members can read; normal clients cannot directly write audit rows in v0.01.
drop policy if exists audit_member_select on public.audit_logs;
create policy audit_member_select on public.audit_logs for select to authenticated
using (public.is_workspace_member(workspace_id));

-- Outbox: no authenticated client policies by design. Process from trusted server/worker.

-- ---------- Grants for RPC ----------
grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.current_workspace_role(uuid) to authenticated;

-- ---------- Bootstrap profile helper ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
