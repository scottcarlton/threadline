-- Stream order_comments changes over Supabase Realtime so federated orders
-- show new comments live on both the rep and brand side. The publication is
-- created by Supabase; we just opt this table in. Existing RLS still gates
-- which subscribers receive each row.
alter publication supabase_realtime add table public.order_comments;
