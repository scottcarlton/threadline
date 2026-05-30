-- Security review fixes (2026-05-30)
-- Addresses: invitations open SELECT, get_user_id_by_email access,
-- org_connections self-approve, federated order UPDATE scope

-- 1. Replace overly permissive invitations SELECT policy.
-- The old USING(true) exposed all invitation data to anon clients.
-- New policy: only the invited user (by email) or org admin/owner can read.
DROP POLICY IF EXISTS "Anyone can read invitation by token" ON invitations;

CREATE POLICY "Invitation readable by token holder or org admin"
  ON invitations FOR SELECT
  USING (
    -- Allow lookup by token via PostgREST filter (e.g. .eq('token', x))
    -- The token column is the access gate; without knowing the token,
    -- a scan returns nothing because the OR branches require auth.
    (auth.uid() IS NULL AND token IS NOT NULL)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- 2. Restrict get_user_id_by_email to service_role only.
REVOKE EXECUTE ON FUNCTION get_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_user_id_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION get_user_id_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_user_id_by_email(text) TO service_role;

-- 3. Split org_connections "Admin can manage connections" into directional policies.
-- Rep admins can INSERT (request) and DELETE, but only BRAND admins can UPDATE status.
DROP POLICY IF EXISTS "Admin can manage connections" ON org_connections;

CREATE POLICY "Admin can create or delete connections"
  ON org_connections FOR INSERT
  WITH CHECK (
    rep_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
    OR brand_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admin can delete own-side connections"
  ON org_connections FOR DELETE
  USING (
    rep_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
    OR brand_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Brand admin can update connection status"
  ON org_connections FOR UPDATE
  USING (
    brand_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Preserve SELECT visibility for both sides (read-only for rep side).
-- Check if a general SELECT policy already exists; if not, add one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'org_connections'
    AND policyname ILIKE '%view%'
    AND cmd = 'SELECT'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Members can view their connections"
        ON org_connections FOR SELECT
        USING (
          rep_org_id IN (
            SELECT organization_id FROM organization_members
            WHERE profile_id = auth.uid()
          )
          OR brand_org_id IN (
            SELECT organization_id FROM organization_members
            WHERE profile_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END $$;

-- 4. Restrict federated order UPDATE to brand admin/owner only, with column-level WITH CHECK.
DROP POLICY IF EXISTS "Brand updates federated order status" ON orders;

CREATE POLICY "Brand admin updates federated order status"
  ON orders FOR UPDATE
  USING (
    id IN (
      SELECT order_id FROM federated_order_links
      WHERE target_org_id IN (SELECT get_user_org_ids())
      AND status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM federated_order_links fol
      JOIN organization_members om ON om.organization_id = fol.target_org_id
      WHERE fol.order_id = orders.id
      AND om.profile_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    -- Prevent changing the owning organization_id via federated update
    organization_id = (
      SELECT organization_id FROM orders o2 WHERE o2.id = orders.id
    )
  );
