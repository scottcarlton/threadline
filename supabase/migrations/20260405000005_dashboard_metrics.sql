-- ============================================================
-- Dashboard Metrics Functions
-- ============================================================

-- Revenue summary for an organization
CREATE OR REPLACE FUNCTION get_revenue_summary(org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_revenue', COALESCE(SUM(total_amount), 0),
    'order_count', COUNT(*),
    'avg_order_value', COALESCE(ROUND(AVG(total_amount), 2), 0),
    'by_status', (
      SELECT COALESCE(json_object_agg(status, status_data), '{}'::json)
      FROM (
        SELECT
          status,
          json_build_object(
            'count', COUNT(*),
            'total', COALESCE(SUM(total_amount), 0)
          ) AS status_data
        FROM orders
        WHERE organization_id = org_id
        GROUP BY status
      ) sub
    )
  ) INTO result
  FROM orders
  WHERE organization_id = org_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Revenue broken down by brand
CREATE OR REPLACE FUNCTION get_revenue_by_brand(org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(sub)), '[]'::json) INTO result
  FROM (
    SELECT
      b.name AS brand_name,
      COALESCE(SUM(o.total_amount), 0) AS revenue,
      COUNT(o.id) AS order_count
    FROM brands b
    LEFT JOIN orders o ON o.brand_id = b.id AND o.organization_id = org_id
    WHERE b.organization_id = org_id AND b.is_active = TRUE
    GROUP BY b.name
    ORDER BY revenue DESC
  ) sub;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Top accounts by revenue
CREATE OR REPLACE FUNCTION get_top_accounts(org_id UUID, limit_count INTEGER DEFAULT 10)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(sub)), '[]'::json) INTO result
  FROM (
    SELECT
      a.business_name,
      COALESCE(SUM(o.total_amount), 0) AS revenue,
      COUNT(o.id) AS order_count
    FROM accounts a
    LEFT JOIN orders o ON o.account_id = a.id AND o.organization_id = org_id
    WHERE a.organization_id = org_id AND a.is_active = TRUE
    GROUP BY a.business_name
    HAVING COALESCE(SUM(o.total_amount), 0) > 0
    ORDER BY revenue DESC
    LIMIT limit_count
  ) sub;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Order pipeline: count and total by status
CREATE OR REPLACE FUNCTION get_order_pipeline(org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(sub)), '[]'::json) INTO result
  FROM (
    SELECT
      status::text AS status,
      COUNT(*) AS count,
      COALESCE(SUM(total_amount), 0) AS total_amount
    FROM orders
    WHERE organization_id = org_id
    GROUP BY status
    ORDER BY CASE status
      WHEN 'draft' THEN 1
      WHEN 'submitted' THEN 2
      WHEN 'confirmed' THEN 3
      WHEN 'shipped' THEN 4
      WHEN 'delivered' THEN 5
      WHEN 'cancelled' THEN 6
    END
  ) sub;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Season insights: revenue and orders per season for a given year
CREATE OR REPLACE FUNCTION get_season_summary(org_id UUID, target_year INTEGER DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(sub)), '[]'::json) INTO result
  FROM (
    SELECT
      s.name AS season_name,
      s.sort_order,
      COALESCE(SUM(o.total_amount), 0) AS revenue,
      COUNT(o.id) AS order_count
    FROM seasons s
    LEFT JOIN orders o ON o.season_id = s.id
      AND o.organization_id = org_id
      AND (target_year IS NULL OR o.order_year = target_year)
    WHERE s.organization_id = org_id
    GROUP BY s.name, s.sort_order
    ORDER BY s.sort_order
  ) sub;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Year-over-year summary
CREATE OR REPLACE FUNCTION get_yearly_summary(org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(sub)), '[]'::json) INTO result
  FROM (
    SELECT
      order_year AS year,
      COUNT(*) AS order_count,
      COALESCE(SUM(total_amount), 0) AS revenue,
      COALESCE(ROUND(AVG(total_amount), 2), 0) AS avg_order_value
    FROM orders
    WHERE organization_id = org_id AND order_year IS NOT NULL
    GROUP BY order_year
    ORDER BY order_year DESC
  ) sub;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
