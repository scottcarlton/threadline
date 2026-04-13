-- In-app notification system
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread on public.notifications (user_id, read_at) where read_at is null;

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users can update their own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

-- Notification preferences per user
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_updates boolean not null default true,
  comments boolean not null default true,
  buyer_activity boolean not null default true,
  team_activity boolean not null default true,
  email_digest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, organization_id)
);

alter table public.notification_preferences enable row level security;

create policy "Users can view their own preferences"
  on public.notification_preferences for select
  using (user_id = auth.uid());

create policy "Users can manage their own preferences"
  on public.notification_preferences for all
  using (user_id = auth.uid());
