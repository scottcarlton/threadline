-- Tie a thumbs up or down to the turn it rates.
--
-- ai_feedback only held copies of the prompt and response text, so a rating
-- could not be joined to the model calls (ai_usage_logs) or tool calls
-- (ai_tool_calls) that produced the answer. Each stored message now carries
-- the turn id its request wrote telemetry under, and a feedback row points at
-- the conversation, the assistant message, and that turn.
--
-- The text copies stay. Deleting a conversation sets these links to null, and
-- the copied text is then all that is left of what was rated.

-- ── ai_messages: the turn that wrote each row ──────────────────────────────

-- Null for rows written before this column existed.
alter table public.ai_messages
	add column if not exists turn_id uuid;

comment on column public.ai_messages.turn_id is
	'The request that wrote this row. Matches ai_usage_logs.turn_id and ai_tool_calls.turn_id.';

-- ── ai_feedback: what was rated ────────────────────────────────────────────

alter table public.ai_feedback
	add column if not exists conversation_id uuid
		references public.ai_conversations(id) on delete set null,
	add column if not exists message_id uuid
		references public.ai_messages(id) on delete set null,
	add column if not exists turn_id uuid;

-- The two FKs are indexed so a conversation delete is not a scan; turn_id is
-- the join to telemetry.
create index if not exists ai_feedback_conversation_idx
	on public.ai_feedback (conversation_id) where conversation_id is not null;
create index if not exists ai_feedback_message_idx
	on public.ai_feedback (message_id) where message_id is not null;
create index if not exists ai_feedback_turn_idx
	on public.ai_feedback (turn_id) where turn_id is not null;

comment on column public.ai_feedback.turn_id is
	'The turn that produced the rated answer. Join to ai_usage_logs and ai_tool_calls.';
comment on column public.ai_feedback.message_content is
	'Copy of the user prompt. Kept so a rating outlives a deleted conversation.';
comment on column public.ai_feedback.response_content is
	'Copy of the rated answer. Kept so a rating outlives a deleted conversation.';
