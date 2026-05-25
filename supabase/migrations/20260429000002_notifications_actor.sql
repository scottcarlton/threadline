-- Snapshot of who triggered the notification (display name, denormalised so
-- the avatar/initials in the UI stay stable even if the profile is renamed).
alter table public.notifications
  add column if not exists actor_name text;
