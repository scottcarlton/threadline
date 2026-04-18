-- ============================================================
-- Brand Account Penetration RPC
--
-- For each account relevant to a brand, returns ordering and
-- revenue aggregates for the target year + prior year (for
-- trend), plus a last_order_date and a has_access flag. The
-- universe of "relevant accounts" is the union of:
--   • accounts that have any order visible via get_brand_order_ids
--     (i.e. have ever bought from the brand through any channel), AND
--   • accounts with account_brand_access granted for any brand
--     owned by brand_org_id (approved to carry the brand, whether
--     they've ordered or not — the "dormant" signal).
--
-- SECURITY DEFINER lets the brand see account rows across its
-- connected rep orgs (accounts are otherwise own-org-only).
-- ============================================================

CREATE OR REPLACE FUNCTION get_brand_account_penetration(
  brand_org_id UUID,
  p_year INTEGER
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(
    json_agg(row_data ORDER BY
      (CASE WHEN current_orders > 0 THEN 0 ELSE 1 END),
      current_revenue DESC,
      business_name ASC
    ),
    '[]'::json
  )
  INTO result
  FROM (
    SELECT
      a.id                               AS account_id,
      a.business_name                    AS business_name,
      a.organization_id                  AS agency_org_id,
      COALESCE(org.name, 'Unknown')      AS agency_name,
      CASE
        WHEN a.organization_id = brand_org_id THEN 'in_house'
        ELSE 'agency'
      END                                AS source,
      COUNT(o.id) FILTER (WHERE o.order_year = p_year)::BIGINT AS current_orders,
      COALESCE(
        SUM(o.total_amount) FILTER (WHERE o.order_year = p_year),
        0
      )::NUMERIC                         AS current_revenue,
      COALESCE(
        SUM(o.total_amount) FILTER (WHERE o.order_year = p_year - 1),
        0
      )::NUMERIC                         AS prior_revenue,
      MAX(o.created_at)                  AS last_order_date,
      (
        EXISTS (
          SELECT 1
          FROM account_brand_access aba2
          JOIN brands b2 ON b2.id = aba2.brand_id
          WHERE aba2.account_id = a.id
            AND b2.organization_id = brand_org_id
        )
      )                                  AS has_access
    FROM accounts a
    JOIN organizations org ON org.id = a.organization_id
    LEFT JOIN orders o
      ON o.account_id = a.id
      AND o.id IN (SELECT get_brand_order_ids(brand_org_id))
      AND o.status != 'cancelled'
    WHERE a.id IN (
      SELECT o2.account_id
      FROM orders o2
      WHERE o2.id IN (SELECT get_brand_order_ids(brand_org_id))
        AND o2.account_id IS NOT NULL
      UNION
      SELECT aba.account_id
      FROM account_brand_access aba
      JOIN brands b ON b.id = aba.brand_id
      WHERE b.organization_id = brand_org_id
    )
    GROUP BY a.id, a.business_name, a.organization_id, org.name, brand_org_id
  ) row_data;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_brand_account_penetration(UUID, INTEGER) TO authenticated;
