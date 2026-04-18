-- ============================================================
-- Style Velocity for Brand (federation-aware)
-- Mirrors get_style_velocity, but scopes orders via
-- federated_order_links so a brand can see style-level
-- performance across all connected rep orgs.
-- ============================================================

CREATE OR REPLACE FUNCTION get_style_velocity_for_brand(
  brand_org_id UUID,
  days_back INTEGER DEFAULT 90,
  min_accounts INTEGER DEFAULT 2
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_data ORDER BY account_count DESC, total_qty DESC), '[]'::json)
  INTO result
  FROM (
    SELECT
      ol.style_number,
      COALESCE(p.name, ol.description, ol.style_number) AS product_name,
      b.name AS brand_name,
      COUNT(DISTINCT o.account_id) AS account_count,
      COUNT(DISTINCT o.id) AS order_count,
      SUM(ol.qty) AS total_qty,
      SUM(ol.qty * ol.unit_price) AS total_revenue,
      ROUND(SUM(ol.qty)::numeric / NULLIF(COUNT(DISTINCT o.account_id), 0), 1) AS avg_qty_per_account,
      MIN(o.created_at) AS first_ordered,
      MAX(o.created_at) AS latest_ordered
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id
    JOIN federated_order_links fol
      ON fol.order_id = o.id
      AND fol.target_org_id = brand_org_id
      AND fol.status = 'active'
    JOIN brands b ON b.id = o.brand_id
    LEFT JOIN products p ON p.id = ol.product_id
    WHERE b.organization_id = brand_org_id
      AND o.status != 'cancelled'
      AND o.created_at >= NOW() - (days_back || ' days')::interval
      AND ol.removed_at IS NULL
      AND ol.style_number IS NOT NULL
      AND ol.style_number != ''
    GROUP BY ol.style_number, COALESCE(p.name, ol.description, ol.style_number), b.name
    HAVING COUNT(DISTINCT o.account_id) >= min_accounts
  ) row_data;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_style_velocity_for_brand(UUID, INTEGER, INTEGER) TO authenticated;
