-- Platform-wide audit log.
--
-- Purpose: answer "who did what, when, in which org, and what was the result"
-- for support and incident troubleshooting. This is an accountability record,
-- deliberately separate from Sentry (errors) and from product analytics.
--
-- Design notes:
--   * Append-only. UPDATE and DELETE are revoked and additionally blocked by a
--     trigger, so neither app code nor a compromised service-role key can
--     rewrite history. Retention happens by dropping whole partitions.
--   * The event taxonomy (`resource.action`) is owned by TypeScript in
--     src/lib/server/audit/events.ts so adding an event does not need a
--     migration. Postgres only enforces the shape.
--   * Actor identity is snapshotted (email/label) because profiles and auth
--     users can be deleted, and an audit row must stay readable afterwards.
--   * Reads are service-role only. No policy grants SELECT to `authenticated`,
--     so RLS denies by default; the /system console reads via supabaseAdmin
--     behind a server-derived `locals.isSystemAdmin` check.

create table public.audit_log (
	id uuid not null default gen_random_uuid(),
	created_at timestamptz not null default now(),

	-- who
	--
	-- Deliberately NOT foreign keys. An `on delete set null` FK would fire an
	-- UPDATE against this table when a user or org is deleted, which the
	-- append-only trigger below rejects — that would make deleting a user
	-- impossible. More fundamentally, history must survive the deletion of the
	-- things it refers to, so identity is stored as an id plus a snapshot of
	-- how that actor read at the time.
	actor_id uuid,
	actor_email text,
	actor_label text,
	actor_kind text not null default 'user' check (
		actor_kind in ('user', 'system_admin', 'service', 'integration', 'anonymous')
	),
	-- Non-human principals (scheduled agents, integration workers, cron) have no
	-- auth.users row. They identify themselves here instead, so no audit row is
	-- ever anonymous just because a machine produced it.
	actor_service text,
	-- Set when a system admin acts through another user's context. `actor_id`
	-- stays the real human; `on_behalf_of` is who they were acting as.
	on_behalf_of uuid,

	-- what
	event_name text not null check (event_name ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
	subject_type text,
	subject_id uuid,
	subject_label text,

	-- where
	organization_id uuid,
	organization_name text,
	route text,
	method text,
	request_id text,
	-- Shared by every event emitted from one request, so a multi-step action
	-- reads as a single story in the UI.
	correlation_id uuid,
	ip inet,
	user_agent text,

	-- outcome ("what was the response")
	status text not null default 'success' check (status in ('success', 'failure')),
	http_status int,
	error_code text,
	error_message text,
	duration_ms int,

	-- payload: `changes` holds {field: {before, after}} for allow-listed fields
	-- only. Never secrets, tokens, or whole row dumps.
	metadata jsonb not null default '{}'::jsonb,
	changes jsonb,

	primary key (id, created_at),

	-- Every row must say who did it. A human actor carries an id; a machine
	-- actor names its service. Only genuinely pre-auth events (a failed sign-in
	-- against an unknown address) may have neither.
	constraint audit_log_actor_identified check (
		actor_id is not null
		or (actor_kind = 'service' and actor_service is not null)
		or actor_kind = 'anonymous'
	)
) partition by range (created_at);

comment on table public.audit_log is
	'Append-only accountability log. Immutable: UPDATE/DELETE blocked. Retention by partition drop.';

-- ───────────────────────────────────────────────────────────────────────────
-- Partitioning
-- ───────────────────────────────────────────────────────────────────────────

-- Creates the monthly partition covering `month_start` if it does not exist.
create or replace function public.ensure_audit_log_partition(month_start date)
returns void as $$
declare
	start_ts date := date_trunc('month', month_start)::date;
	end_ts date := (date_trunc('month', month_start) + interval '1 month')::date;
	part_name text := 'audit_log_' || to_char(start_ts, 'YYYY_MM');
begin
	if to_regclass('public.' || part_name) is not null then
		return;
	end if;
	execute format(
		'create table public.%I partition of public.audit_log for values from (%L) to (%L)',
		part_name, start_ts, end_ts
	);
end;
$$ language plpgsql security definer set search_path = public;

-- Rolling-window maintenance. Safe to call repeatedly; wire to pg_cron only if
-- the 24-month runway created below is ever exhausted.
create or replace function public.maintain_audit_log_partitions(months_ahead int default 3)
returns void as $$
declare
	i int;
begin
	for i in 0..months_ahead loop
		perform public.ensure_audit_log_partition((current_date + (i || ' month')::interval)::date);
	end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- Pre-create a 24-month runway so routine operation needs no scheduler.
do $$
declare
	i int;
begin
	for i in 0..23 loop
		perform public.ensure_audit_log_partition((date_trunc('month', current_date) + (i || ' month')::interval)::date);
	end loop;
end;
$$;

-- Safety net: a row whose timestamp falls outside every partition still lands
-- somewhere rather than failing the insert.
create table public.audit_log_default partition of public.audit_log default;

-- ───────────────────────────────────────────────────────────────────────────
-- Indexes — the three access paths of the /system console
-- ───────────────────────────────────────────────────────────────────────────

-- "show me this org's activity"
create index audit_log_org_time_idx on public.audit_log (organization_id, created_at desc);
-- "show me this user's activity"
create index audit_log_actor_time_idx on public.audit_log (actor_id, created_at desc);
-- "everything that happened to this order/account/product"
create index audit_log_subject_idx on public.audit_log (subject_type, subject_id, created_at desc);
-- filtering a timeline down to one kind of event
create index audit_log_event_time_idx on public.audit_log (event_name, created_at desc);
-- surfacing failures first during an incident
create index audit_log_failures_idx on public.audit_log (created_at desc) where status = 'failure';
-- stitching one request's events together
create index audit_log_correlation_idx on public.audit_log (correlation_id) where correlation_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- Immutability
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.reject_audit_log_mutation()
returns trigger as $$
begin
	raise exception 'audit_log is append-only: % is not permitted', tg_op
		using errcode = 'insufficient_privilege';
end;
$$ language plpgsql;

create trigger audit_log_no_update
	before update on public.audit_log
	for each statement execute function public.reject_audit_log_mutation();

create trigger audit_log_no_delete
	before delete on public.audit_log
	for each statement execute function public.reject_audit_log_mutation();

-- ───────────────────────────────────────────────────────────────────────────
-- Access
-- ───────────────────────────────────────────────────────────────────────────

alter table public.audit_log enable row level security;

-- Intentionally no policies: RLS denies `authenticated` and `anon` outright.
-- The /system console reads through supabaseAdmin (service_role, which bypasses
-- RLS) gated on a server-derived `locals.isSystemAdmin`.

revoke all on public.audit_log from anon, authenticated;
grant insert, select on public.audit_log to service_role;
revoke update, delete on public.audit_log from service_role;

grant execute on function public.ensure_audit_log_partition(date) to service_role;
grant execute on function public.maintain_audit_log_partitions(int) to service_role;
