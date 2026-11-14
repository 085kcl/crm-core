alter table public.contacts
add column search_document tsvector generated always as (
  setweight(to_tsvector('simple'::regconfig, coalesce(first_name,'')), 'A') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(last_name,'')), 'A') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(email,'')), 'B') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(phone,'')), 'B') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(whatsapp,'')), 'B') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(document,'')), 'B')
) stored;

alter table public.companies
add column search_document tsvector generated always as (
  setweight(to_tsvector('simple'::regconfig, coalesce(trade_name,'')), 'A') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(legal_name,'')), 'A') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(tax_id,'')), 'B') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(website,'')), 'C') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(segment,'')), 'C')
) stored;

alter table public.leads
add column search_document tsvector generated always as (
  setweight(to_tsvector('simple'::regconfig, coalesce(source,'')), 'B') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(qualification,'')), 'A')
) stored;

alter table public.deals
add column search_document tsvector generated always as (
  setweight(to_tsvector('simple'::regconfig, coalesce(title,'')), 'A') ||
  setweight(to_tsvector('simple'::regconfig, coalesce(lost_reason,'')), 'B')
) stored;

create index idx_contacts_search_document on public.contacts using gin(search_document);
create index idx_companies_search_document on public.companies using gin(search_document);
create index idx_leads_search_document on public.leads using gin(search_document);
create index idx_deals_search_document on public.deals using gin(search_document);
create index idx_tasks_workspace_open_due on public.tasks(workspace_id, entity_type, entity_id, due_at)
where status in ('open','in_progress');

create or replace function public.search_crm(
  p_workspace_id uuid,
  p_query text,
  p_limit integer default 20
)
returns table(
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select trim(coalesce(p_query,'')) as raw_query,
           websearch_to_tsquery('simple'::regconfig, trim(coalesce(p_query,''))) as tsq,
           greatest(1, least(coalesce(p_limit,20),100)) as lim
  ), results as (
    select
      'contact'::text as entity_type,
      c.id as entity_id,
      trim(concat_ws(' ', c.first_name, c.last_name)) as title,
      coalesce(c.email, c.phone, c.whatsapp, c.document, '') as subtitle,
      greatest(
        ts_rank(c.search_document, p.tsq),
        case when lower(coalesce(c.email,'')) like '%'||lower(p.raw_query)||'%' then 0.8 else 0 end,
        case when coalesce(c.phone,'') like '%'||p.raw_query||'%' then 0.7 else 0 end,
        case when coalesce(c.whatsapp,'') like '%'||p.raw_query||'%' then 0.7 else 0 end,
        case when coalesce(c.document,'') like '%'||p.raw_query||'%' then 0.7 else 0 end
      )::real as rank
    from public.contacts c cross join params p
    where c.workspace_id = p_workspace_id
      and p.raw_query <> ''
      and (c.search_document @@ p.tsq
        or lower(coalesce(c.email,'')) like '%'||lower(p.raw_query)||'%'
        or coalesce(c.phone,'') like '%'||p.raw_query||'%'
        or coalesce(c.whatsapp,'') like '%'||p.raw_query||'%'
        or coalesce(c.document,'') like '%'||p.raw_query||'%')

    union all

    select
      'company'::text,
      c.id,
      c.trade_name,
      coalesce(c.legal_name, c.tax_id, c.website, ''),
      greatest(
        ts_rank(c.search_document, p.tsq),
        case when coalesce(c.tax_id,'') like '%'||p.raw_query||'%' then 0.7 else 0 end,
        case when lower(coalesce(c.website,'')) like '%'||lower(p.raw_query)||'%' then 0.5 else 0 end
      )::real
    from public.companies c cross join params p
    where c.workspace_id = p_workspace_id
      and p.raw_query <> ''
      and (c.search_document @@ p.tsq
        or coalesce(c.tax_id,'') like '%'||p.raw_query||'%'
        or lower(coalesce(c.website,'')) like '%'||lower(p.raw_query)||'%')

    union all

    select
      'lead'::text,
      l.id,
      'Lead · ' || trim(concat_ws(' ', c.first_name, c.last_name)),
      concat_ws(' · ', l.source, l.status::text, 'Score '||l.score::text),
      ts_rank(l.search_document, p.tsq)::real
    from public.leads l
    join public.contacts c on c.workspace_id=l.workspace_id and c.id=l.contact_id
    cross join params p
    where l.workspace_id = p_workspace_id
      and p.raw_query <> ''
      and l.search_document @@ p.tsq

    union all

    select
      'deal'::text,
      d.id,
      d.title,
      concat_ws(' · ', d.state::text, case when d.amount is not null then d.currency::text||' '||d.amount::text end),
      ts_rank(d.search_document, p.tsq)::real
    from public.deals d cross join params p
    where d.workspace_id = p_workspace_id
      and p.raw_query <> ''
      and d.search_document @@ p.tsq
  )
  select r.entity_type, r.entity_id, r.title, r.subtitle, r.rank
  from results r cross join params p
  where private.is_workspace_member(p_workspace_id)
  order by r.rank desc, r.title
  limit (select lim from params);
$$;

revoke all on function public.search_crm(uuid,text,integer) from public, anon;
grant execute on function public.search_crm(uuid,text,integer) to authenticated;

create or replace view public.contact_360_summary
with (security_invoker = true)
as
select
  c.id,
  c.workspace_id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.whatsapp,
  c.document,
  c.birth_date,
  c.status,
  c.owner_id,
  c.created_at,
  c.updated_at,
  pc.company_id as primary_company_id,
  pc.trade_name as primary_company_name,
  coalesce(companies.company_count,0)::bigint as company_count,
  coalesce(leads.lead_count,0)::bigint as lead_count,
  coalesce(deals.open_deal_count,0)::bigint as open_deal_count,
  coalesce(deals.won_deal_count,0)::bigint as won_deal_count,
  coalesce(deals.lost_deal_count,0)::bigint as lost_deal_count,
  coalesce(deals.open_pipeline_value,0)::numeric as open_pipeline_value,
  coalesce(tasks.open_task_count,0)::bigint as open_task_count,
  coalesce(tasks.overdue_task_count,0)::bigint as overdue_task_count,
  coalesce(tags.tag_count,0)::bigint as tag_count,
  coalesce(custom_fields.custom_field_count,0)::bigint as custom_field_count,
  activities.last_activity_at
from public.contacts c
left join lateral (
  select co.company_id, cp.trade_name
  from public.contact_companies co
  join public.companies cp on cp.workspace_id=co.workspace_id and cp.id=co.company_id
  where co.workspace_id=c.workspace_id and co.contact_id=c.id
  order by co.is_primary desc, co.created_at asc
  limit 1
) pc on true
left join lateral (
  select count(*) as company_count
  from public.contact_companies co
  where co.workspace_id=c.workspace_id and co.contact_id=c.id
) companies on true
left join lateral (
  select count(*) as lead_count
  from public.leads l
  where l.workspace_id=c.workspace_id and l.contact_id=c.id
) leads on true
left join lateral (
  select
    count(*) filter (where d.state='open') as open_deal_count,
    count(*) filter (where d.state='won') as won_deal_count,
    count(*) filter (where d.state='lost') as lost_deal_count,
    coalesce(sum(d.amount) filter (where d.state='open'),0) as open_pipeline_value
  from public.deals d
  where d.workspace_id=c.workspace_id and d.contact_id=c.id
) deals on true
left join lateral (
  select
    count(*) filter (where t.status in ('open','in_progress')) as open_task_count,
    count(*) filter (where t.status in ('open','in_progress') and t.due_at < now()) as overdue_task_count
  from public.tasks t
  where t.workspace_id=c.workspace_id and t.entity_type='contact' and t.entity_id=c.id
) tasks on true
left join lateral (
  select count(*) as tag_count
  from public.entity_tags et
  where et.workspace_id=c.workspace_id and et.entity_type='contact' and et.entity_id=c.id
) tags on true
left join lateral (
  select count(*) as custom_field_count
  from public.custom_field_values cfv
  where cfv.workspace_id=c.workspace_id and cfv.entity_type='contact' and cfv.entity_id=c.id
) custom_fields on true
left join lateral (
  select max(a.created_at) as last_activity_at
  from public.activities a
  where a.workspace_id=c.workspace_id and a.entity_type='contact' and a.entity_id=c.id
) activities on true;

revoke all on public.contact_360_summary from anon;
grant select on public.contact_360_summary to authenticated, service_role;
