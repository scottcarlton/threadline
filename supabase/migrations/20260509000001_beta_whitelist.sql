-- Beta whitelist: only emails in this table can access the app
-- when BETA_WHITELIST_ENABLED is set. Managed via Supabase dashboard.
create table public.beta_whitelist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  constraint beta_whitelist_email_unique unique (email)
);

alter table public.beta_whitelist enable row level security;
-- No RLS policies: only service role (supabaseAdmin) can read/write.
