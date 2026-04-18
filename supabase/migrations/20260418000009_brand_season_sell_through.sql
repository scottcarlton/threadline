-- ============================================================
-- Brand Season Sell-Through RPC
--
-- For each season owned by the brand org, returns:
--   • products_in_season  — size of the brand's season catalog
--   • products_ordered    — distinct styles that have sold
--   • total_units         — units ordered (qty on order_lines)
--   • total_revenue       — qty × unit_price
--   • order_count         — distinct orders for the season
--   • account_count       — distinct ordering accounts
--
-- Orders are scoped via get_brand_order_ids so BOLSR + MBISR
-- orders both count. Filtered to the target order_year.
--
-- "Available" is catalog-size (distinct active products), since
-- Threadline does not track planned unit quantities per season.
-- ============================================================

CREATE OR REPLACE FUNCTION get_brand_season_sell_through(
  brand_org_id UUID,
  p_year INTEGER
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(
    json_agg(row_data ORDER BY sort_order ASC, season_name ASC),
    '[]'::json
  )
  INTO result
  FROM (
    SELECT
      s.id                                    AS season_id,
      s.name                                  AS season_name,
      s.sort_order                            AS sort_order,
      s.is_active                             AS is_active,
      (
        SELECT COUNT(DISTINCT p.id)
        FROM products p
        WHERE p.organization_id = brand_org_id
          AND p.season_id = s.id
          AND p.is_active = true
          AND p.archived_at IS NULL
      )::BIGINT                               AS products_in_season,
      COUNT(DISTINCT ol.product_id) FILTER (WHERE ol.product_id IS NOT NULL)::BIGINT
                                              AS products_ordered,
      COALESCE(SUM(ol.qty), 0)::BIGINT        AS total_units,
      COALESCE(SUM(ol.qty * ol.unit_price), 0)::NUMERIC
                                              AS total_revenue,
      COUNT(DISTINCT o.id) FILTER (WHERE o.id IS NOT NULL)::BIGINT
                                              AS order_count,
      COUNT(DISTINCT o.account_id) FILTER (WHERE o.account_id IS NOT NULL)::BIGINT
                                              AS account_count
    FROM seasons s
    LEFT JOIN orders o
      ON o.season_id = s.id
      AND o.id IN (SELECT get_brand_order_ids(brand_org_id))
      AND o.order_year = p_year
      AND o.status != 'cancelled'
    LEFT JOIN order_lines ol
      ON ol.order_id = o.id
      AND ol.removed_at IS NULL
    WHERE s.organization_id = brand_org_id
    GROUP BY s.id, s.name, s.sort_order, s.is_active
  ) row_data;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_brand_season_sell_through(UUID, INTEGER) TO authenticated;
