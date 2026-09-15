-- Seed data intentionally left empty.
-- Use the onboarding flow to create your first org, brands, and accounts.

-- Beta whitelist (local dev only): mirrors the dashboard-managed rows in prod so
-- local runs identically when BETA_WHITELIST_ENABLED=true. seed.sql is not applied
-- to deployed environments, so these personal emails stay local.
insert into public.beta_whitelist (email, notes)
values
  ('scott.carlton@me.com', 'local dev seed'),
  ('hello@scottcarlton.is', 'local dev seed'),
  ('scott@threadline.systems', 'local dev seed')
on conflict (email) do nothing;
