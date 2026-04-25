-- Adds an optional phone number to profiles so buyers (and any other user)
-- can manage their own contact phone independently of org/account records.
-- Used by the buyer account profile self-management form (SCO-40).

ALTER TABLE profiles
  ADD COLUMN phone TEXT;
