-- Pre-organization onboarding answers.
--
-- `organizations.onboarding_state` can only resume once an org row exists, but
-- the first phase (name → org type → org name) runs *before* creation — so a
-- refresh there lost everything and made the user retype their name.
--
-- The profile row exists from signup, so it's the natural home for those
-- answers. Once the org is created, `organizations.onboarding_state` takes over
-- and this draft is no longer read.
--
-- Shape: { "name": "Scott Carlton", "orgType": "brand" }

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_draft JSONB;

COMMENT ON COLUMN profiles.onboarding_draft IS
	'Pre-org onboarding answers { name, orgType }. Superseded by organizations.onboarding_state once the org exists.';
