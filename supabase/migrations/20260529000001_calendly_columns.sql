-- Add Calendly-specific columns to email_connections
alter table email_connections
  add column if not exists scheduling_url text,
  add column if not exists calendly_user_uri text;
