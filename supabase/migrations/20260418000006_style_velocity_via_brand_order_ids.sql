-- ============================================================
-- Route Product Performance through get_brand_order_ids
--
-- 20260418000004 scoped velocity only to orders reached via
-- federated_order_links, so BOLSR orders (same-org sales reps)
-- were invisible. This rewrites the function body to pull order
-- IDs from get_brand_order_ids (BOLSR + MBISR) introduced in
-- 20260418000005 so brand-side velocity now reflects every
-- order written for the brand's line.
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
    JOIN brands b ON b.id = o.brand_id
    LEFT JOIN products p ON p.id = ol.product_id
    WHERE o.id IN (SELECT get_brand_order_ids(brand_org_id))
      AND b.organization_id = brand_org_id
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;
