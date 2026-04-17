-- Federation RLS: MBISR→BOA implicit visibility for brands, products, and brand assets.
-- BOA→MBISR visibility uses explicit links (federated_order_links, federated_account_links)
-- and is NOT handled here — those policies exist in 20260411000002_federation_infrastructure.sql.
--
-- See docs/plans/rbac-federation-fix.md §1.3 for the asymmetric model.

-- ============================================================================
-- Helper: get_connected_org_ids()
-- Returns org IDs from active connections (both directions).
-- Used for MBISR→BOA implicit federation (brands, products, brand_assets).
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
-- Brands: connected reps see brand org's brands (MBISR→BOA implicit)
-- ============================================================================
CREATE POLICY "Brands visible via federation"
  ON brands FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================================
-- Brand assets: connected reps see brand org's assets (MBISR→BOA implicit)
-- ============================================================================
CREATE POLICY "Brand assets visible via federation"
  ON brand_assets FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================================
-- Brand expenses INSERT: allow reps to submit expenses against federated brands.
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
-- Brand expenses SELECT: BOA sees expenses where brand_id belongs to BOA's brands.
-- Scoped to brand ownership, not blanket connected-org visibility.
-- ============================================================================
CREATE POLICY "Expenses visible via federation"
  ON brand_expenses FOR SELECT
  USING (
    brand_id IN (
      SELECT b.id FROM brands b
      WHERE b.organization_id IN (SELECT get_user_org_ids())
    )
    AND organization_id NOT IN (SELECT get_user_org_ids())
  );

-- NOTE: The following policies were INTENTIONALLY OMITTED per §C.4 of the plan:
--   - "Accounts visible via federation" — BOA sees MBISR accounts via federated_account_links only (explicit model)
--   - "Account locations visible via federation" — follows accounts
--   - "Account tags visible via federation" — follows accounts
--   - "Tag assignments visible via federation" — follows accounts
-- These belong to the explicit-link federation model, not the implicit model.
