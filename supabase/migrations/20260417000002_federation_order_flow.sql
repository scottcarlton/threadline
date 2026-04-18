-- Fix the new-order flow for MBISR users ordering against connected brands.
-- Four issues addressed:
--   1. Seasons/deliveries invisible to connected reps (no federation RLS)
--   2. Orders INSERT rejects federated brand_ids (get_user_brand_ids is own-org only)
--   3. auto_federate_order() trigger matches on rep_brand_id instead of brand org
--   4. Order lines INSERT needs federation support for the parent order check

-- ============================================================
-- 1. Seasons: connected reps see brand org's seasons
-- ============================================================
CREATE POLICY "Seasons visible via federation"
  ON seasons FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================
-- 2. Season deliveries: connected reps see brand org's deliveries
-- ============================================================
CREATE POLICY "Deliveries visible via federation"
  ON season_deliveries FOR SELECT
  USING (organization_id IN (SELECT get_connected_org_ids()));

-- ============================================================
-- 3. Orders INSERT: allow reps to create orders with federated brand_ids
-- ============================================================
DROP POLICY IF EXISTS "Admin/owner/member/sales can insert orders" ON orders;
DROP POLICY IF EXISTS "Admin/owner/member can insert orders" ON orders;

CREATE POLICY "Admin/owner/member/sales can insert orders"
  ON orders FOR INSERT
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

-- ============================================================
-- 4. Fix auto_federate_order() trigger
--    Old: matched on oc.rep_brand_id = NEW.brand_id (wrong — compares
--         rep's local brand to BOA's authoritative brand)
--    New: match via the brand's owning org = the connection's brand_org_id
-- ============================================================
CREATE OR REPLACE FUNCTION auto_federate_order()
RETURNS TRIGGER AS $$
DECLARE
  conn RECORD;
BEGIN
  -- Find an active connection where the order's brand belongs to the brand org
  SELECT oc.id, oc.brand_org_id INTO conn
  FROM org_connections oc
  JOIN brands b ON b.id = NEW.brand_id
  WHERE oc.rep_org_id = NEW.organization_id
    AND oc.brand_org_id = b.organization_id
    AND oc.status = 'active'
  LIMIT 1;

  IF conn.id IS NOT NULL THEN
    -- Link the order to the connection
    UPDATE orders SET connection_id = conn.id WHERE id = NEW.id;

    INSERT INTO federated_order_links (order_id, connection_id, source_org_id, target_org_id)
    VALUES (NEW.id, conn.id, NEW.organization_id, conn.brand_org_id)
    ON CONFLICT (order_id, target_org_id) DO NOTHING;

    -- Create federated account link if not already linked
    INSERT INTO federated_account_links (account_id, connection_id, source_org_id, target_org_id)
    VALUES (NEW.account_id, conn.id, NEW.organization_id, conn.brand_org_id)
    ON CONFLICT (account_id, target_org_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
