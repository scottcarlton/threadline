-- Order comments for threaded internal discussion
create table if not exists public.order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_comments enable row level security;

create policy "Users can view comments on orders in their org"
  on public.order_comments for select
  using (order_id in (
    select id from public.orders where organization_id in (
      select organization_id from public.organization_members where profile_id = auth.uid()
    )
  ));

create policy "Non-guest users can create comments"
  on public.order_comments for insert
  with check (
    author_id = auth.uid()
    and order_id in (
      select id from public.orders where organization_id in (
        select organization_id from public.organization_members where profile_id = auth.uid() and role != 'guest'
      )
    )
  );

create policy "Users can update their own comments"
  on public.order_comments for update
  using (author_id = auth.uid());

create policy "Users can delete their own comments"
  on public.order_comments for delete
  using (author_id = auth.uid());
