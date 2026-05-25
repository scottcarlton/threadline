-- org_setup_status: tracks skipped/declined setup sections
create table org_setup_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  section text not null,
  status text not null default 'pending',
  updated_at timestamptz not null default now(),
  unique(organization_id, section)
);

alter table org_setup_status enable row level security;

create policy "org_setup_status_select"
  on org_setup_status for select using (
    organization_id in (
      select organization_id from organization_members where profile_id = auth.uid()
    )
  );

create policy "org_setup_status_all"
  on org_setup_status for all using (
    organization_id in (
      select organization_id from organization_members where profile_id = auth.uid()
    )
  );

-- Seed default shipping methods for existing brand orgs that have none
insert into organization_shipping_methods (organization_id, name, cost_type, delivery_window)
select o.id, m.name, m.cost_type::text, m.delivery_window
from organizations o
cross join (values
  ('Ground', 'flat', '5–7 business days'),
  ('Express', 'flat', '2–3 business days'),
  ('Overnight', 'flat', '1 business day')
) as m(name, cost_type, delivery_window)
where o.org_type = 'brand'
  and not exists (
    select 1 from organization_shipping_methods sm where sm.organization_id = o.id
  );
