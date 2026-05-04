-- ============================================================
-- get_sales_analytics RPC
-- Single entry point for AI sales queries. Picks the correct
-- materialized view based on org type. Supports date range,
-- season, and group-by dimensions.
-- ============================================================

CREATE OR REPLACE FUNCTION get_sales_analytics(
  p_org_id       UUID,
  p_org_type     TEXT,            -- 'rep' or 'brand'
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL,
  p_season_id    UUID DEFAULT NULL,
  p_brand_id     UUID DEFAULT NULL,
  p_account_id   UUID DEFAULT NULL,
  p_rep_user_id  UUID DEFAULT NULL,
  p_group_by     TEXT DEFAULT 'total'  -- 'total', 'brand', 'account', 'rep', 'season', 'date', 'status', 'source'
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  base_query TEXT;
  where_clauses TEXT[] := ARRAY[]::TEXT[];
  group_col TEXT;
  name_join TEXT := '';
BEGIN
  -- Pick the right view and org filter
  IF p_org_type = 'brand' THEN
    base_query := 'FROM mv_brand_sales_daily v';
    where_clauses := array_append(where_clauses, format('v.brand_org_id = %L', p_org_id));
  ELSE
    base_query := 'FROM mv_rep_sales_daily v';
    where_clauses := array_append(where_clauses, format('v.organization_id = %L', p_org_id));
  END IF;

  -- Date range filter
  IF p_date_from IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('v.order_date >= %L', p_date_from));
  END IF;
  IF p_date_to IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('v.order_date <= %L', p_date_to));
  END IF;

  -- Dimension filters
  IF p_season_id IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('v.season_id = %L', p_season_id));
  END IF;
  IF p_brand_id IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('v.brand_id = %L', p_brand_id));
  END IF;
  IF p_account_id IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('v.account_id = %L', p_account_id));
  END IF;
  IF p_rep_user_id IS NOT NULL THEN
    where_clauses := array_append(where_clauses, format('v.rep_user_id = %L', p_rep_user_id));
  END IF;

  -- Determine grouping
  CASE p_group_by
    WHEN 'brand' THEN
      group_col := 'v.brand_id';
      name_join := 'LEFT JOIN brands b ON b.id = v.brand_id';
    WHEN 'account' THEN
      group_col := 'v.account_id';
      name_join := 'LEFT JOIN accounts a ON a.id = v.account_id';
    WHEN 'rep' THEN
      group_col := 'v.rep_user_id';
      name_join := 'LEFT JOIN profiles p ON p.id = v.rep_user_id';
    WHEN 'season' THEN
      group_col := 'v.season_id';
      name_join := 'LEFT JOIN seasons s ON s.id = v.season_id';
    WHEN 'date' THEN
      group_col := 'v.order_date';
    WHEN 'status' THEN
      group_col := 'v.status';
    WHEN 'source' THEN
      IF p_org_type = 'brand' THEN
        group_col := 'v.source';
      ELSE
        group_col := '''direct''';
      END IF;
    ELSE -- 'total'
      group_col := NULL;
  END CASE;

  -- Build and execute dynamic query
  IF group_col IS NULL THEN
    -- Total aggregation (no grouping)
    EXECUTE format(
      'SELECT json_build_object(
        ''revenue'', COALESCE(SUM(v.revenue), 0),
        ''order_count'', COALESCE(SUM(v.order_count), 0),
        ''units_sold'', COALESCE(SUM(v.units_sold), 0),
        ''avg_order_value'', CASE WHEN SUM(v.order_count) > 0
          THEN ROUND(SUM(v.revenue) / SUM(v.order_count), 2) ELSE 0 END
      ) %s %s WHERE %s',
      base_query,
      name_join,
      array_to_string(where_clauses, ' AND ')
    ) INTO result;
  ELSE
    -- Grouped aggregation
    EXECUTE format(
      'SELECT COALESCE(json_agg(row_data ORDER BY revenue DESC), ''[]''::json)
       FROM (
         SELECT
           %s AS group_key,
           %s
           SUM(v.revenue)::numeric AS revenue,
           SUM(v.order_count)::int AS order_count,
           SUM(v.units_sold)::int AS units_sold,
           CASE WHEN SUM(v.order_count) > 0
             THEN ROUND(SUM(v.revenue) / SUM(v.order_count), 2) ELSE 0 END AS avg_order_value
         %s %s
         WHERE %s
         GROUP BY %s %s
       ) row_data',
      group_col,
      CASE p_group_by
        WHEN 'brand' THEN 'b.name AS group_name,'
        WHEN 'account' THEN 'a.business_name AS group_name,'
        WHEN 'rep' THEN 'COALESCE(p.display_name, ''Unknown'') AS group_name,'
        WHEN 'season' THEN 'COALESCE(s.name, ''Unknown'') AS group_name,'
        WHEN 'date' THEN 'v.order_date::text AS group_name,'
        WHEN 'status' THEN 'v.status::text AS group_name,'
        WHEN 'source' THEN format('%s::text AS group_name,', group_col)
        ELSE '''Total'' AS group_name,'
      END,
      base_query,
      name_join,
      array_to_string(where_clauses, ' AND '),
      group_col,
      CASE p_group_by
        WHEN 'brand' THEN ', b.name'
        WHEN 'account' THEN ', a.business_name'
        WHEN 'rep' THEN ', p.display_name'
        WHEN 'season' THEN ', s.name'
        ELSE ''
      END
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_sales_analytics(UUID, TEXT, DATE, DATE, UUID, UUID, UUID, UUID, TEXT) TO authenticated;
