-- ============================================================
-- Brand Territory Coverage RPC
--
-- For a brand viewing their federated + in-house orders, group
-- activity by (account's owning org, account's territory). The
-- account's territory lives in its owning org: BOLSR accounts
-- → brand's own territories; MBISR accounts → the rep org's
-- territories. SECURITY DEFINER lets the brand read territory
-- names that would otherwise be hidden by RLS.
--
-- V1 scope: "activity-based" coverage — rows are territories
-- that have at least one order for the brand. Territories with
-- zero activity are not returned (requires cross-org territory
-- visibility, out of scope here).
-- ============================================================

CREATE OR REPLACE FUNCTION get_brand_territory_coverage(
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
      a.organization_id                  AS agency_org_id,
      COALESCE(org.name, 'Unknown')      AS agency_name,
      CASE
        WHEN a.organization_id = brand_org_id THEN 'in_house'
        ELSE 'agency'
      END                                AS source,
      t.id                               AS territory_id,
      COALESCE(t.name, 'Unassigned')     AS territory_name,
      COUNT(DISTINCT o.account_id)::BIGINT AS account_count,
      COUNT(DISTINCT o.id)::BIGINT         AS order_count,
      SUM(o.total_amount)::NUMERIC         AS revenue
    FROM orders o
    JOIN accounts a ON a.id = o.account_id
    JOIN organizations org ON org.id = a.organization_id
    LEFT JOIN territories t ON t.id = a.territory_id
    WHERE o.id IN (SELECT get_brand_order_ids(brand_org_id))
      AND o.order_year = p_year
      AND o.status != 'cancelled'
    GROUP BY a.organization_id, org.name, t.id, t.name, brand_org_id
  ) row_data;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_brand_territory_coverage(UUID, INTEGER) TO authenticated;
