-- Default connection invites to auto-approve so reps connect immediately.
ALTER TABLE connection_invites
  ALTER COLUMN auto_approve SET DEFAULT TRUE;

-- Flip any existing invites that still have the old default.
UPDATE connection_invites SET auto_approve = TRUE WHERE auto_approve = FALSE;
