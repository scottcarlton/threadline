-- Rep sees connected brand's accounts (MBISR→BOA implicit federation).
--
-- Migration 20260417000001_federation_rls.sql intentionally omitted this
-- policy for the BOA→MBISR direction (brand must not see every rep account
-- implicitly — that direction is gated by federated_account_links only). But
-- the MBISR→BOA direction was a casualty of that omission. Other federation-
-- aware tables (brands, products, product_variants, product_images,
-- brand_assets) already have the unidirectional rep-sees-brand policy; this
-- migration closes the gap for accounts and satellites.
--
-- Pattern mirrors 20260411000003_cross_org_product_visibility.sql. Uses
-- rep-side-only subquery on org_connections, NOT get_connected_org_ids(),
-- so brand org members cannot use this policy to see rep accounts.

-- ============================================================
-- Accounts
-- ============================================================
CREATE POLICY "Rep sees connected brand accounts"
  ON accounts FOR SELECT
  USING (
    organization_id IN (
      SELECT oc.brand_org_id FROM org_connections oc
      WHERE oc.rep_org_id IN (SELECT get_user_org_ids())
        AND oc.status = 'active'
    )
  );

-- ============================================================
-- Account locations (has its own organization_id column)
-- ============================================================
CREATE POLICY "Rep sees connected brand account locations"
  ON account_locations FOR SELECT
  USING (
    organization_id IN (
      SELECT oc.brand_org_id FROM org_connections oc
      WHERE oc.rep_org_id IN (SELECT get_user_org_ids())
        AND oc.status = 'active'
    )
  );

-- ============================================================
-- Account tags (has organization_id)
-- ============================================================
CREATE POLICY "Rep sees connected brand account tags"
  ON account_tags FOR SELECT
  USING (
    organization_id IN (
      SELECT oc.brand_org_id FROM org_connections oc
      WHERE oc.rep_org_id IN (SELECT get_user_org_ids())
        AND oc.status = 'active'
    )
  );

-- ============================================================
-- Account tag assignments (no direct org_id; gate via accounts)
-- ============================================================
CREATE POLICY "Rep sees connected brand account tag assignments"
  ON account_tag_assignments FOR SELECT
  USING (
    account_id IN (
      SELECT a.id FROM accounts a
      WHERE a.organization_id IN (
        SELECT oc.brand_org_id FROM org_connections oc
        WHERE oc.rep_org_id IN (SELECT get_user_org_ids())
          AND oc.status = 'active'
      )
    )
  );
