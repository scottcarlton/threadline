-- ============================================================
-- Brand Order Pipeline RPC
--
-- Groups every non-cancelled order visible to the brand org
-- (BOLSR + MBISR, via get_brand_order_ids) by current status.
-- Returns one row per status with count and total amount.
--
-- Pipeline is a current-state view — no year filter, so "what's
-- pending / confirmed / shipped right now" includes orders from
-- any year that are still in a non-terminal workflow.
-- ============================================================

CREATE OR REPLACE FUNCTION get_brand_order_pipeline(brand_org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_data), '[]'::json)
  INTO result
  FROM (
    SELECT
      o.status::TEXT                     AS status,
      COUNT(*)::BIGINT                   AS count,
      COALESCE(SUM(o.total_amount), 0)::NUMERIC AS total_amount
    FROM orders o
    WHERE o.id IN (SELECT get_brand_order_ids(brand_org_id))
      AND o.status != 'cancelled'
    GROUP BY o.status
    ORDER BY
      CASE o.status::TEXT
        WHEN 'draft'     THEN 1
        WHEN 'submitted' THEN 2
        WHEN 'confirmed' THEN 3
        WHEN 'shipped'   THEN 4
        WHEN 'delivered' THEN 5
        ELSE 99
      END
  ) row_data;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_brand_order_pipeline(UUID) TO authenticated;
