-- Durable record of failed phone verification attempts.
--
-- The counter behind MAX_ATTEMPTS lived in a module-level Map in the webhook
-- handler. On Fluid Compute that is per instance, so the cap reset whenever a
-- request landed on a fresh one: the limit was advisory at best and trivially
-- outlasted by anyone willing to keep texting. The map also never pruned.
--
-- Unverified senders produce no messaging_messages rows either, so this is the
-- only durable trace of a stranger repeatedly texting our number. Rows are kept
-- long enough to be useful for that and pruned after.

create table if not exists public.messaging_verification_attempts (
	phone_number text primary key,
	attempts integer not null default 0,
	first_attempt_at timestamptz not null default now(),
	last_attempt_at timestamptz not null default now()
);

comment on table public.messaging_verification_attempts is
	'Failed phone-verification attempts per number. Replaces an in-memory counter that reset per instance.';

create index if not exists messaging_verification_attempts_last_idx
	on public.messaging_verification_attempts (last_attempt_at desc);

-- Server-only, matching the other messaging tables: no policy grants access to
-- anon or authenticated, so RLS denies them and the webhook writes via
-- supabaseAdmin.
alter table public.messaging_verification_attempts enable row level security;
revoke all on public.messaging_verification_attempts from anon, authenticated;

-- Atomic increment. Doing this as read-then-write in the handler would let two
-- concurrent messages from the same number each read the same count and both
-- get through.
create or replace function public.record_verification_attempt(lookup_phone text)
returns integer as $$
	insert into public.messaging_verification_attempts (phone_number, attempts)
	values (lookup_phone, 1)
	on conflict (phone_number) do update
		set attempts = public.messaging_verification_attempts.attempts + 1,
		    last_attempt_at = now()
	returning attempts;
$$ language sql security definer set search_path = public;

create or replace function public.prune_verification_attempts(older_than interval default interval '30 days')
returns integer as $$
declare
	deleted integer;
begin
	delete from public.messaging_verification_attempts where last_attempt_at < now() - older_than;
	get diagnostics deleted = row_count;
	return deleted;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.record_verification_attempt(text) to service_role;
grant execute on function public.prune_verification_attempts(interval) to service_role;
