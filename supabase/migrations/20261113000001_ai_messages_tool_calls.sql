-- Remember which tools ran behind each assistant reply.
--
-- History for a follow-up turn is rebuilt from ai_messages, which held only
-- the reply text. The model then saw its own earlier numbers with no lookup
-- behind them, decided it had made them up, and retracted them. With no record
-- of an earlier create_order it could also place the same order twice
-- (SCO-218).
--
-- Each assistant row now records the tools its turn called and how each one
-- ended. Tool names and statuses only: inputs and results carry customer data
-- and are not stored, the same rule as ai_tool_calls.

alter table public.ai_messages
	add column if not exists tool_calls jsonb;

alter table public.ai_messages
	drop constraint if exists ai_messages_tool_calls_is_array;
alter table public.ai_messages
	add constraint ai_messages_tool_calls_is_array
		check (tool_calls is null or jsonb_typeof(tool_calls) = 'array');

comment on column public.ai_messages.tool_calls is
	'Assistant rows only: [{tool, status}] for each tool the turn called, status ok, error, denied or invalid. Null when no tools ran or for rows written before this column existed.';
