-- SCO-192: decide, function by function, who may execute the SECURITY DEFINER
-- functions that `anon` could reach.
--
-- None of these were opened on purpose. Supabase's default privileges grant
-- EXECUTE on every new public function to `anon`, `authenticated` and
-- `service_role` directly, so `REVOKE ... FROM PUBLIC` (or no revoke at all)
-- leaves anon able to call them with nothing but the public key. Several of
-- the original migrations even say `grant execute ... to service_role`, which
-- shows the intent; the default grant quietly overrode it.
--
-- Every hole below was reproduced with the anon key before this was written:
--
--   * get_revenue_summary, get_order_pipeline, get_top_accounts and the rest of
--     the analytics RPCs returned any org's revenue and top accounts by name,
--     to anon and to a signed-in user of an unrelated org alike. None checked
--     the caller.
--   * prune_ai_requests deleted every AI rate-limit row, resetting the limit
--     on demand. record_verification_attempt let anyone push a phone number
--     into verification lockout.
--   * apply_line_ops and insert_order_lines_with_actor take the actor as an
--     argument and wrote to an arbitrary order.
--   * ensure_audit_log_partition ran DDL.
--
-- Three outcomes, chosen per function rather than swept:
--
--   1. Service-role only. Every app caller already uses supabaseAdmin, or
--      the function is only called from inside other SECURITY DEFINER
--      functions (which run as the owner and pass the EXECUTE check
--      regardless), or nothing calls it at all.
--
--   2. Signed-in callers who belong to the org. The analytics RPCs are called
--      through locals.supabase from /insight, /reports and the AI tools, always
--      with an org the user is a member of. They gain an explicit membership
--      check (service_role exempt, for the agent executor) and lose anon.
--
--   3. Unchanged, anon keeps EXECUTE. The RLS helpers used by policies that
--      apply to `public`. Policy expressions run as the querying role, so
--      revoking from anon would turn an empty result into a permission error
--      on any table anon touches. All of them key on auth.uid() and return
--      nothing for anon; tests/rls/definer-grants.test.ts pins that list so a
--      new function cannot join it silently.

-- ── 1. Service-role only ────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.apply_line_ops(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_order_lines_with_actor(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_ai_requests(interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_verification_attempts(interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_verification_attempt(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_audit_log_partition(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maintain_audit_log_partitions(integer) FROM PUBLIC, anon, authenticated;
-- Take a member id, return the hierarchy under it. Only src/lib/server/scoping.ts
-- calls them, through the service-role client.
REVOKE EXECUTE ON FUNCTION public.get_managed_member_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_managed_profile_ids(uuid) FROM PUBLIC, anon, authenticated;
-- Take any org id and list its order / account ids. Only called from inside
-- other SECURITY DEFINER functions, or not at all.
REVOKE EXECUTE ON FUNCTION public.get_brand_order_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_federated_account_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_federated_order_ids(uuid) FROM PUBLIC, anon, authenticated;
-- Revenue for any org by id, with no caller check and no caller in the app.
-- Closing them is safer than guarding code nothing runs.
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_brand(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_revenue_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_top_accounts(uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_line_ops(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_order_lines_with_actor(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_ai_requests(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_verification_attempts(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verification_attempt(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_audit_log_partition(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.maintain_audit_log_partitions(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_managed_member_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_managed_profile_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_brand_order_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_federated_account_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_federated_order_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_brand(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_top_accounts(uuid, integer) TO service_role;

-- ── 2. Analytics: members of the org, never anon ────────────────────────────
--
-- Bodies are the live definitions, unchanged apart from the guard at the top
-- of each. The NULL arm is explicit: is_org_member is false rather than NULL
-- today, but COALESCE keeps the guard closed if that ever changes (SCO-189).

CREATE OR REPLACE FUNCTION public.get_brand_account_penetration(brand_org_id uuid, p_year integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(brand_org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_order_pipeline(brand_org_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(brand_org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_sales_by_rep(brand_org_id uuid, p_year integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(brand_org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_season_sell_through(brand_org_id uuid, p_year integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(brand_org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_territory_coverage(brand_org_id uuid, p_year integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(brand_org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_order_pipeline(org_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_analytics(p_org_id uuid, p_org_type text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_season_id uuid DEFAULT NULL::uuid, p_brand_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_rep_user_id uuid DEFAULT NULL::uuid, p_group_by text DEFAULT 'total'::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  base_query TEXT;
  where_clauses TEXT[] := ARRAY[]::TEXT[];
  group_col TEXT;
  name_join TEXT := '';
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(p_org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
    ) INTO result;
  END IF;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_season_summary(org_id uuid, target_year integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_style_velocity(org_id uuid, days_back integer DEFAULT 14, min_accounts integer DEFAULT 2)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_style_velocity_for_brand(brand_org_id uuid, days_back integer DEFAULT 90, min_accounts integer DEFAULT 2)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(brand_org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.get_yearly_summary(org_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  -- SCO-192: caller must belong to the org whose numbers this returns.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(org_id), false) THEN
    RAISE EXCEPTION 'Not a member of this organization'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
$function$;

-- CREATE OR REPLACE keeps existing grants, so anon still holds EXECUTE here.
REVOKE EXECUTE ON FUNCTION public.get_brand_account_penetration(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_brand_order_pipeline(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_brand_sales_by_rep(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_brand_season_sell_through(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_brand_territory_coverage(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_order_pipeline(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_analytics(uuid, text, date, date, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_season_summary(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_style_velocity(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_style_velocity_for_brand(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_yearly_summary(uuid) FROM PUBLIC, anon;

-- RLS helpers that no anon-applicable policy uses. They key on auth.uid(), so
-- signed-in callers keep them for any future policy; anon has no use for them.
REVOKE EXECUTE ON FUNCTION public.can_write_brands(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_buyer_user() FROM PUBLIC, anon;
