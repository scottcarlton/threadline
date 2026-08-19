-- Pending invitations were invisible everywhere in the app.
--
-- The SELECT policy from 20260530000001_security_review_fixes.sql matched an
-- invitee by subquerying auth.users:
--
--   OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
--
-- The `authenticated` role has no SELECT grant on auth.users, so Postgres
-- raised "permission denied for table users" while *evaluating the policy* —
-- which fails the whole query, not just that branch. Every read of invitations
-- errored for every authenticated user, including org admins reading their own
-- org's invites. /organization/members does `invResult.data ?? []`, so the
-- error was swallowed and the page showed an empty list: invites sent, nothing
-- to show for them.
--
-- auth.jwt() reads the caller's own claims and needs no table grant.

DROP POLICY IF EXISTS "Invitation readable by token holder or org admin" ON invitations;

CREATE POLICY "Invitation readable by token holder or org admin"
  ON invitations FOR SELECT
  USING (
    -- Allow lookup by token via PostgREST filter (e.g. .eq('token', x)).
    -- The token column is the access gate; without knowing the token,
    -- a scan returns nothing because the OR branches require auth.
    (auth.uid() IS NULL AND token IS NOT NULL)
    -- The invitee, matched on the email in their own JWT.
    OR email = (auth.jwt() ->> 'email')
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );
