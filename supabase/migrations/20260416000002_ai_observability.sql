-- Observability tables for AI usage tracking + user feedback.
-- Both tables are write-mostly from the server; RLS lets org members
-- read their own org's rows so we can build dashboards later.

-- Token usage per Anthropic API call
create table if not exists public.ai_usage_logs (
	id uuid primary key default gen_random_uuid(),
	organization_id uuid references public.organizations(id) on delete cascade,
	user_id uuid references auth.users(id) on delete set null,
	endpoint text not null,          -- e.g. 'chat', 'briefing', 'linesheet', 'agent'
	purpose text not null,           -- e.g. 'tools', 'chat', 'classifier'
	model text not null,
	prompt_version text,
	input_tokens integer,
	output_tokens integer,
	cache_read_tokens integer,
	cache_creation_tokens integer,
	created_at timestamptz default now()
);

create index if not exists idx_ai_usage_logs_org_time
	on public.ai_usage_logs (organization_id, created_at desc);

alter table public.ai_usage_logs enable row level security;

create policy "AI usage visible to org members"
	on public.ai_usage_logs for select
	using (is_org_member(organization_id));

-- Service role inserts usage rows; users don't need an insert policy.

-- Thumbs up / down feedback on assistant messages
create table if not exists public.ai_feedback (
	id uuid primary key default gen_random_uuid(),
	organization_id uuid references public.organizations(id) on delete cascade,
	user_id uuid references auth.users(id) on delete set null,
	message_content text not null,
	response_content text not null,
	rating smallint not null check (rating in (-1, 1)),
	feedback_text text,
	prompt_version text,
	created_at timestamptz default now()
);

create index if not exists idx_ai_feedback_org_time
	on public.ai_feedback (organization_id, created_at desc);

alter table public.ai_feedback enable row level security;

create policy "Feedback visible to org members"
	on public.ai_feedback for select
	using (is_org_member(organization_id));

create policy "Org members can submit feedback"
	on public.ai_feedback for insert
	with check (is_org_member(organization_id));
