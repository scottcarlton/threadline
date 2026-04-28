-- Track onboarding progress on the org so a refresh during onboarding
-- doesn't bounce the user to /insight, and so they can resume at the
-- step they last left off.
--
-- onboarding_step          — 1..N, the last step the user reached.
--                            Defaults to 1 for any new org row.
-- onboarding_completed_at  — set when the user clicks "finish" on the
--                            welcome screen. NULL means "still in
--                            progress." This is the redirect signal:
--                            /onboarding bounces only when this is set.
ALTER TABLE organizations
    ADD COLUMN onboarding_step INT NOT NULL DEFAULT 1,
    ADD COLUMN onboarding_completed_at TIMESTAMPTZ;

-- Backfill: every org that exists today is treated as completed so
-- existing users aren't unexpectedly dropped back into onboarding.
UPDATE organizations
   SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW());
