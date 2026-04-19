-- ============================================================
-- Brand report primitives
--
-- 1. get_brand_order_ids(brand_org_id)
--    Shared primitive returning every order ID visible to a
--    brand org from BOTH sources:
--      • BOLSR (brand-org-level sales rep) — orders placed by
--        a user within the brand's own org, for a brand the
--        org owns (orders.organization_id = brand_org_id).
--      • MBISR (multi-brand independent sales rep) — orders
--        placed from a connected rep org, linked via
--        federated_order_links.target_org_id = brand_org_id.
--
--    Every brand report should scope orders via this helper so
--    "my brand's orders" means the same thing everywhere.
--
-- 2. get_brand_sales_by_rep(brand_org_id, p_year)
--    First consumer. Returns one row per rep user (orders.created_by)
--    with their agency org, source flag, and aggregates.
-- ============================================================

CREATE OR REPLACE FUNCTION get_brand_order_ids(brand_org_id UUID)
RETURNS SETOF UUID AS $$
  -- BOLSR: orders placed inside the brand's own org for a brand
  -- that the org owns. orders.organization_id = brand.organization_id
  -- is enforced by the orders INSERT RLS for same-org orders, but we
  -- also match brands.organization_id to be defensive against future
  -- cross-org self-brand scenarios.
  SELECT o.id
  FROM orders o
  JOIN brands b ON b.id = o.brand_id
  WHERE b.organization_id = brand_org_id
    AND o.organization_id = brand_org_id
  UNION
  -- MBISR: orders federated into this brand org via an active link.
  SELECT fol.order_id
  FROM federated_order_links fol
  WHERE fol.target_org_id = brand_org_id
    AND fol.status = 'active';
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_brand_order_ids(UUID) TO authenticated;

-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_brand_sales_by_rep(
  brand_org_id UUID,
  p_year INTEGER
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_data ORDER BY revenue DESC, order_count DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      o.created_by                               AS rep_user_id,
      COALESCE(p.display_name, 'Unknown')        AS rep_name,
      o.organization_id                          AS agency_org_id,
      COALESCE(org.name, 'Unknown')              AS agency_name,
      CASE
        WHEN o.organization_id = brand_org_id THEN 'in_house'
        ELSE 'agency'
      END                                        AS source,
      COUNT(*)::BIGINT                           AS order_count,
      SUM(o.total_amount)::NUMERIC               AS revenue,
      (SUM(o.total_amount) / COUNT(*))::NUMERIC  AS avg_order_value,
      MAX(o.created_at)                          AS last_order_date
    FROM orders o
    JOIN profiles p ON p.id = o.created_by
    JOIN organizations org ON org.id = o.organization_id
    WHERE o.id IN (SELECT get_brand_order_ids(brand_org_id))
      AND o.order_year = p_year
      AND o.status != 'cancelled'
    GROUP BY o.created_by, p.display_name, o.organization_id, org.name, brand_org_id
  ) row_data;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_brand_sales_by_rep(UUID, INTEGER) TO authenticated;
