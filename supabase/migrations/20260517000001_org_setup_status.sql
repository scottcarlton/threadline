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
