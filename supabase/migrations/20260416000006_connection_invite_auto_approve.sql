-- Add auto_approve option to connection invites
-- When true, reps who claim the invite are connected immediately without brand review.
ALTER TABLE connection_invites
  ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN NOT NULL DEFAULT FALSE;
