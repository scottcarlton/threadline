-- Richer onboarding resume cursor.
--
-- `onboarding_step` only records which of the four phases the user reached, so
-- refreshing mid-phase dropped them back to that phase's first question — and
-- re-running a completed sub-step (e.g. re-sending team invites) failed as
-- duplicates. `onboarding_state` records the exact cursor, which sub-steps are
-- done or skipped, and the running import counts so the summary survives a
-- reload.
--
-- Shape: { "phase": 1, "sub": 2, "subStates": { "1.0": "done" }, "stats": [...] }
--
-- `onboarding_step` is kept for backward compatibility (the load guard and any
-- older client still read it); both are written together.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_state JSONB;

COMMENT ON COLUMN organizations.onboarding_state IS
	'Onboarding resume cursor: { phase, sub, subStates, stats }. Written alongside onboarding_step.';
