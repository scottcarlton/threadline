-- Sender authentication for inbound email orders.
--
-- The intake pipeline trusted the From header alone, so a spoofed message from
-- a known rep's address could be auto-submitted as a real order. We now read
-- the SPF/DKIM/DMARC verdict out of the raw headers Brevo passes through and
-- record it alongside the intake, so a reviewer can see why something was held.

alter table public.email_intakes
	add column if not exists sender_authenticated boolean,
	add column if not exists sender_auth_summary text;

comment on column public.email_intakes.sender_authenticated is
	'SPF/DKIM/DMARC verdict for the From address. NULL for rows predating the check. FALSE blocks auto-submit.';
comment on column public.email_intakes.sender_auth_summary is
	'Human-readable reason for the verdict, shown in the review queue.';

-- Finding unauthenticated intakes is the query support will actually run.
create index if not exists email_intakes_unauthenticated_idx
	on public.email_intakes (created_at desc)
	where sender_authenticated is not true;
