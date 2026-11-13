-- SCO-151: public, time-limited links to a frozen copy of a report.
--
-- A link is a snapshot, not a live view. The rows, chart and columns are
-- captured when the link is made, scoped exactly as its creator saw them, and
-- the public page renders only that snapshot. It never queries org data, so a
-- link can never show more than its creator could see, and revoking or
-- expiring it removes everything behind it.
--
-- Only the SHA-256 of the token is stored. The token itself exists in the URL
-- handed to the user and nowhere else, so a leaked table does not leak working
-- links.
--
-- Admin and owner only, the same line Roles & Access draws for sending org data
-- outside the login wall (connections, integrations). Writes go through the
-- service role behind that app-layer role check; nothing here grants a write.

create table if not exists public.report_share_links (
	id uuid primary key default gen_random_uuid(),
	organization_id uuid not null
		references public.organizations(id) on delete cascade,
	-- The report slug, e.g. 'sales-by-brand'.
	report text not null,
	title text not null,
	-- The filter the snapshot was taken with, e.g. 'Year 2026'.
	filter_label text not null,
	-- { variant, rows }. The chart and columns are rebuilt from these at render
	-- time by the same pure functions the page uses.
	snapshot jsonb not null,
	token_hash text not null unique,
	created_by uuid references public.profiles(id) on delete set null,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	revoked_at timestamptz,
	revoked_by uuid references public.profiles(id) on delete set null,
	constraint report_share_links_expires_after_created check (expires_at > created_at),
	-- revoked_by can go null later when its profile is deleted, so the only
	-- rule is that nobody is recorded as revoking a live link.
	constraint report_share_links_revoked_by_needs_revoked_at check (
		revoked_by is null or revoked_at is not null
	)
);

-- The report page lists a report's live links for the org.
create index if not exists report_share_links_org_report_idx
	on public.report_share_links (organization_id, report, created_at desc);

alter table public.report_share_links enable row level security;

create policy "Org admin/owner can view report share links"
	on public.report_share_links for select
	to authenticated
	using (get_user_role(organization_id) in ('admin', 'owner'));

revoke all on public.report_share_links from anon;
revoke insert, update, delete, truncate on public.report_share_links from authenticated;
