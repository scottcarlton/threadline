-- Account tags for segmentation
create table if not exists public.account_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default 'zinc',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.account_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  tag_id uuid not null references public.account_tags(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(account_id, tag_id)
);

alter table public.account_tags enable row level security;
alter table public.account_tag_assignments enable row level security;

create policy "Users can view account tags for their org"
  on public.account_tags for select
  using (organization_id in (
    select organization_id from public.organization_members where profile_id = auth.uid()
  ));

create policy "Admins can manage account tags"
  on public.account_tags for all
  using (organization_id in (
    select organization_id from public.organization_members where profile_id = auth.uid() and role in ('admin', 'owner')
  ));

create policy "Users can view tag assignments for their org accounts"
  on public.account_tag_assignments for select
  using (account_id in (
    select id from public.accounts where organization_id in (
      select organization_id from public.organization_members where profile_id = auth.uid()
    )
  ));

create policy "Non-guest users can manage tag assignments"
  on public.account_tag_assignments for all
  using (account_id in (
    select id from public.accounts where organization_id in (
      select organization_id from public.organization_members where profile_id = auth.uid() and role != 'guest'
    )
  ));

-- Seed default tags for existing orgs
insert into public.account_tags (organization_id, name, color, sort_order)
select id, 'VIP', 'amber', 1 from public.organizations
union all
select id, 'At Risk', 'red', 2 from public.organizations
union all
select id, 'New', 'violet', 3 from public.organizations
union all
select id, 'Prospect', 'blue', 4 from public.organizations
union all
select id, 'Inactive', 'zinc', 5 from public.organizations;
