-- ============================================================
-- Style Velocity / Demand Forecasting
-- ============================================================

CREATE OR REPLACE FUNCTION get_style_velocity(
  org_id UUID,
  days_back INTEGER DEFAULT 14,
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
      MAX(o.created_at) AS latest_ordered,
      (
        SELECT COALESCE(json_agg(c.color ORDER BY c.cqty DESC), '[]'::json)
        FROM (
          SELECT ol2.color, SUM(ol2.qty) AS cqty
          FROM order_lines ol2
          JOIN orders o2 ON o2.id = ol2.order_id
          WHERE o2.organization_id = org_id
            AND o2.status != 'cancelled'
            AND o2.created_at >= NOW() - (days_back || ' days')::interval
            AND ol2.removed_at IS NULL
            AND ol2.style_number = ol.style_number
            AND ol2.color IS NOT NULL AND ol2.color != ''
          GROUP BY ol2.color
          ORDER BY cqty DESC
          LIMIT 3
        ) c
      ) AS top_colors
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id
    JOIN brands b ON b.id = o.brand_id
    LEFT JOIN products p ON p.id = ol.product_id
    WHERE o.organization_id = org_id
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
