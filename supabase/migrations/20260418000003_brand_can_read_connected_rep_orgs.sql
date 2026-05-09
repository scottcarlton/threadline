-- ============================================================
-- Brand users can SELECT organizations rows for rep orgs they
-- have an active connection with. Federation visibility only —
-- mirrors the brand→rep direction used by federated_*_links.
-- Additive to the existing membership policy; does not replace it.
--
-- Required for the Sales by Rep Agency report (SCO-127): the
-- implicit FK join `org_connections.organizations:rep_org_id(name)`
-- returns NULL for brand users without this policy, because a
-- brand user is not a member of the connected rep's org.
-- ============================================================

CREATE POLICY "Brand can view connected rep organizations"
  ON organizations
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT oc.rep_org_id
      FROM org_connections oc
      WHERE oc.brand_org_id IN (
        SELECT om.organization_id
        FROM organization_members om
        WHERE om.profile_id = auth.uid()
      )
      AND oc.status = 'active'
    )
  );
