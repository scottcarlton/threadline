-- Per-user "viewed" tracking for orders. Used to drive the Orders nav badge
-- ('unviewed + unconfirmed' semantics): users get a ping for orders they
-- haven't opened yet, and brand admins also get a ping for federated orders
-- in `submitted` status awaiting confirmation.

create table public.order_views (
  order_id uuid not null references public.orders(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (order_id, profile_id)
);

alter table public.order_views enable row level security;

create policy "Users read their own views"
  on public.order_views for select
  using (profile_id = auth.uid());

create policy "Users mark their own views"
  on public.order_views for insert
  with check (profile_id = auth.uid());

create policy "Users update their own views"
  on public.order_views for update
  using (profile_id = auth.uid());
