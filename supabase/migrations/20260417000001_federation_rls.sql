-- Federation RLS: make cross-org data visible through the normal supabase client
-- when organizations are connected via org_connections.
--
-- Instead of patching every page server with supabaseAdmin queries, we add
-- RLS policies that let connected org data pass through naturally.

-- ============================================================================
-- Helper: get_connected_org_ids()
-- Returns org IDs from active connections (both directions).
-- ============================================================================
CREATE OR REPLACE FUNCTION get_connected_org_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Brand orgs connected to a rep org the user belongs to
  RETURN QUERY
    SELECT oc.brand_org_id
    FROM org_connections oc
    JOIN organization_members om ON om.organization_id = oc.rep_org_id
    WHERE om.profile_id = auth.uid()
      AND oc.status = 'active';

  -- Rep orgs connected to a brand org the user belongs to
  RETURN QUERY
    SELECT oc.rep_org_id
    FROM org_connections oc
    JOIN organization_members om ON om.organization_id = oc.brand_org_id
    WHERE om.profile_id = auth.uid()
      AND oc.status = 'active';
END;
$$;

-- ============================================================================
-- Brands: connected reps see brand org's brands
-- (existing policy only covers own-org via get_user_brand_ids)
-- ============================================================================
CREATE POLICY "Brands visible via federation"
  ON brands FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================================
-- Brand assets: connected reps see brand org's assets
-- (existing policy only covers own-org via is_org_member)
-- ============================================================================
CREATE POLICY "Brand assets visible via federation"
  ON brand_assets FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================================
-- Accounts: connected orgs see each other's accounts
-- (existing federation policy uses federated_account_links which requires
--  explicit linking; this covers all accounts from connected orgs)
-- ============================================================================
CREATE POLICY "Accounts visible via federation"
  ON accounts FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================================
-- Account locations: follow accounts — visible if the account's org is connected
-- (existing policy only covers own-org via is_org_member)
-- ============================================================================
CREATE POLICY "Account locations visible via federation"
  ON account_locations FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================================
-- Brand expenses: allow reps to INSERT expenses against federated brands.
-- The existing INSERT policy requires brand_id IN get_user_brand_ids(org_id),
-- which fails for federated brands. Drop and recreate with federation support.
-- ============================================================================
DROP POLICY IF EXISTS "Admin/owner/member/sales can insert expenses" ON brand_expenses;

CREATE POLICY "Admin/owner/member/sales can insert expenses"
  ON brand_expenses FOR INSERT
  WITH CHECK (
    (
      brand_id IN (SELECT get_user_brand_ids(organization_id))
      OR brand_id IN (
        SELECT b.id FROM brands b
        WHERE b.organization_id IN (SELECT get_connected_org_ids())
      )
    )
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  );

-- ============================================================================
-- Brand expenses SELECT: also allow viewing expenses for federated brands
-- (existing policy scopes by brand_id via get_user_brand_ids)
-- ============================================================================
CREATE POLICY "Expenses visible via federation"
  ON brand_expenses FOR SELECT
  USING (
    brand_id IN (
      SELECT b.id FROM brands b
      WHERE b.organization_id IN (SELECT get_connected_org_ids())
    )
  );

-- ============================================================================
-- Account tags: visible if the account's org is connected (for viewing)
-- ============================================================================
CREATE POLICY "Account tags visible via federation"
  ON account_tags FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================================
-- Account tag assignments: visible if the account is in a connected org
-- ============================================================================
CREATE POLICY "Tag assignments visible via federation"
  ON account_tag_assignments FOR SELECT
  USING (
    account_id IN (
      SELECT a.id FROM accounts a
      WHERE a.organization_id IN (SELECT get_connected_org_ids())
    )
  );
