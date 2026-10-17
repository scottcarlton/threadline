-- AI telemetry: group model calls into turns, record failures, and log every
-- tool call Stitch makes.
--
-- Before this, ai_usage_logs could say what a call cost but not which request
-- it belonged to, how long it took, why it stopped, or that it failed at all
-- (a row was only written after a successful response). A bad Stitch turn
-- could not be reconstructed, and tool failures only ever went back to the
-- model.
--
-- Rows are written by the server through supabaseAdmin. Records are built and
-- checked against a Zod schema before insert (src/lib/schemas/ai-telemetry.ts);
-- the constraints below are the database's half of the same contract.

-- ── ai_usage_logs: turn, timing, outcome ───────────────────────────────────

alter table public.ai_usage_logs
	add column if not exists turn_id uuid,
	add column if not exists conversation_id uuid
		references public.ai_conversations(id) on delete set null,
	add column if not exists latency_ms integer,
	-- Anthropic's stop_reason, stored verbatim. Deliberately not a CHECK: the
	-- set is the vendor's and grows (refusal, pause_turn arrived after launch),
	-- and a constraint would turn a new value into a dropped telemetry row.
	add column if not exists stop_reason text,
	-- Ours, so constrained. Existing rows were all successful calls.
	add column if not exists status text not null default 'ok',
	add column if not exists error text;

do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'ai_usage_logs_status_check'
			and conrelid = 'public.ai_usage_logs'::regclass
	) then
		alter table public.ai_usage_logs
			add constraint ai_usage_logs_status_check check (status in ('ok', 'error'));
	end if;

	-- An error row says what went wrong; a success row has nothing to say.
	if not exists (
		select 1 from pg_constraint
		where conname = 'ai_usage_logs_error_matches_status'
			and conrelid = 'public.ai_usage_logs'::regclass
	) then
		alter table public.ai_usage_logs
			add constraint ai_usage_logs_error_matches_status
				check ((status = 'error') = (error is not null));
	end if;

	if not exists (
		select 1 from pg_constraint
		where conname = 'ai_usage_logs_latency_nonnegative'
			and conrelid = 'public.ai_usage_logs'::regclass
	) then
		alter table public.ai_usage_logs
			add constraint ai_usage_logs_latency_nonnegative
				check (latency_ms is null or latency_ms >= 0);
	end if;
end $$;

-- Reassembling one turn, and the cascade from a deleted conversation.
create index if not exists ai_usage_logs_turn_idx
	on public.ai_usage_logs (turn_id) where turn_id is not null;
create index if not exists ai_usage_logs_conversation_idx
	on public.ai_usage_logs (conversation_id) where conversation_id is not null;

comment on column public.ai_usage_logs.turn_id is
	'Groups every model call made for one user-visible request (a chat turn, an agent run, one inbound message).';
comment on column public.ai_usage_logs.status is
	'ok: the model returned. error: the call threw; tokens are null and error says why.';

-- ── ai_tool_calls ──────────────────────────────────────────────────────────

create table if not exists public.ai_tool_calls (
	id bigint generated always as identity primary key,
	organization_id uuid not null references public.organizations(id) on delete cascade,
	user_id uuid references auth.users(id) on delete set null,
	turn_id uuid not null,
	-- Same vocabulary as ai_usage_logs.endpoint: 'chat', 'agent', 'messaging-agent'.
	endpoint text not null,
	tool text not null,
	-- ok: ran and reported success. error: ran and failed, or threw.
	-- denied: refused before running (see denial_reason).
	-- invalid: the model's input failed the tool's schema; never ran.
	status text not null check (status in ('ok', 'error', 'denied', 'invalid')),
	denial_reason text check (denial_reason in ('guest_read_only', 'brand_scope')),
	-- Short, already redacted by the writer. Tool inputs are not stored: they
	-- carry customer data, and the turn's messages already hold them.
	error text,
	latency_ms integer check (latency_ms is null or latency_ms >= 0),
	created_at timestamptz not null default now(),
	constraint ai_tool_calls_denial_matches_status
		check ((status = 'denied') = (denial_reason is not null))
);

comment on table public.ai_tool_calls is
	'One row per tool call an AI agent attempted. Server-written telemetry; read via supabaseAdmin.';

-- Per-org history, one turn's calls, and failure rate by tool.
create index if not exists ai_tool_calls_org_time_idx
	on public.ai_tool_calls (organization_id, created_at desc);
create index if not exists ai_tool_calls_turn_idx
	on public.ai_tool_calls (turn_id);
create index if not exists ai_tool_calls_tool_time_idx
	on public.ai_tool_calls (tool, created_at desc);
-- auth.users deletes set user_id null; index the FK so that is not a scan.
create index if not exists ai_tool_calls_user_idx
	on public.ai_tool_calls (user_id) where user_id is not null;

-- Server-only, like ai_requests: RLS on with no policies, and no grants to
-- the request roles. Writes and reads go through supabaseAdmin.
alter table public.ai_tool_calls enable row level security;
revoke all on public.ai_tool_calls from anon, authenticated;
