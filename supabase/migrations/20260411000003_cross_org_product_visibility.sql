-- ============================================================
-- Phase 5: Cross-Org Product Visibility
-- Rep sees connected brand's authoritative product catalog
-- ============================================================

-- Rep org members can see products from connected brand orgs
CREATE POLICY "Rep sees connected brand products"
  ON products FOR SELECT
  USING (
    organization_id IN (
      SELECT brand_org_id FROM org_connections
      WHERE rep_org_id IN (SELECT get_user_org_ids())
      AND status = 'active'
    )
  );

-- Rep org members can see product variants from connected brand orgs
CREATE POLICY "Rep sees connected brand product variants"
  ON product_variants FOR SELECT
  USING (
    product_id IN (
      SELECT p.id FROM products p
      WHERE p.organization_id IN (
        SELECT brand_org_id FROM org_connections
        WHERE rep_org_id IN (SELECT get_user_org_ids())
        AND status = 'active'
      )
    )
  );

-- Rep org members can see product images from connected brand orgs
CREATE POLICY "Rep sees connected brand product images"
  ON product_images FOR SELECT
  USING (
    product_id IN (
      SELECT p.id FROM products p
      WHERE p.organization_id IN (
        SELECT brand_org_id FROM org_connections
        WHERE rep_org_id IN (SELECT get_user_org_ids())
        AND status = 'active'
      )
    )
  );
