-- Request-rate accounting for the AI endpoints.
--
-- Why a separate table rather than counting ai_usage_logs: that ledger is
-- written fire-and-forget, only on a successful Anthropic response, and only
-- after the call returns. A burst loop can fire many requests before the first
-- row lands, and refused or errored calls never appear at all. Rate limiting
-- needs a row written *before* the model is called, which is what this is.
--
-- ai_usage_logs remains the source of truth for the token budget, since spend
-- is only knowable after the response.
--
-- Rows are short-lived: nothing here is needed beyond the longest window we
-- count over. prune_ai_requests() drops the tail and is safe to call often.

create table if not exists public.ai_requests (
	id bigint generated always as identity primary key,
	organization_id uuid not null references public.organizations(id) on delete cascade,
	user_id uuid references auth.users(id) on delete set null,
	endpoint text not null,
	created_at timestamptz not null default now()
);

comment on table public.ai_requests is
	'Short-lived request counter for AI endpoint rate limiting. Pruned hourly; not an audit record.';

-- The two windows we count over.
create index if not exists ai_requests_user_time_idx
	on public.ai_requests (user_id, created_at desc);
create index if not exists ai_requests_org_time_idx
	on public.ai_requests (organization_id, created_at desc);

-- Server-only, like the messaging tables. No policy grants access to
-- authenticated or anon, so RLS denies them by default; the endpoints write
-- through supabaseAdmin.
alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;

create or replace function public.prune_ai_requests(older_than interval default interval '2 hours')
returns integer as $$
declare
	deleted integer;
begin
	delete from public.ai_requests where created_at < now() - older_than;
	get diagnostics deleted = row_count;
	return deleted;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.prune_ai_requests(interval) to service_role;
