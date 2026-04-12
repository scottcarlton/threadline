-- Add archived_at to brands and accounts
ALTER TABLE brands ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN archived_at TIMESTAMPTZ;

-- Drop is_active column (replaced by archived_at: null = active, not null = archived)
-- Keep is_active for now for backward compat, but archived_at is the source of truth
