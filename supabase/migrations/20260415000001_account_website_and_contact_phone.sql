-- Add website and dedicated contact_phone columns to accounts.
-- Existing `phone` column remains the business phone; `contact_phone` is the
-- primary contact's direct phone (introduced with the multi-step Add Account wizard).

alter table public.accounts
	add column if not exists website text,
	add column if not exists contact_phone text;
