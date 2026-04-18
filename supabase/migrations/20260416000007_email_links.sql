-- Manual email-to-entity links. Inbox emails are fetched from Gmail at
-- request time (not stored locally), so we key by gmail_message_id to
-- persist user-selected associations across sessions.

create table if not exists public.email_links (
	id uuid primary key default gen_random_uuid(),
	organization_id uuid not null references public.organizations(id) on delete cascade,
	gmail_message_id text not null,
	entity_type text not null check (entity_type in ('account', 'order')),
	entity_id uuid not null,
	linked_by uuid references auth.users(id) on delete set null,
	created_at timestamptz default now(),
	unique(organization_id, gmail_message_id)
);

create index if not exists idx_email_links_org_msg
	on public.email_links (organization_id, gmail_message_id);

alter table public.email_links enable row level security;

create policy "Email links visible to org members"
	on public.email_links for select
	using (is_org_member(organization_id));

create policy "Org members can insert email links"
	on public.email_links for insert
	with check (is_org_member(organization_id));

create policy "Org members can update email links"
	on public.email_links for update
	using (is_org_member(organization_id));

create policy "Org members can delete email links"
	on public.email_links for delete
	using (is_org_member(organization_id));
