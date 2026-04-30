-- Soft-delete column for notifications. Dismissed notifications are filtered
-- out of the in-app notification center (they remain in the table for audit).
alter table public.notifications
  add column if not exists dismissed_at timestamptz;

create index if not exists idx_notifications_user_active
  on public.notifications (user_id, created_at desc)
  where dismissed_at is null;
