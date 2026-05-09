-- ============================================================
-- Sales Analytics Materialized Views
-- ============================================================

-- Rep org daily sales: one row per (org, brand, account, rep, season, date, status).
-- Scoped by orders.organization_id — the org that placed the order.
CREATE MATERIALIZED VIEW mv_rep_sales_daily AS
SELECT
  o.organization_id,
  o.brand_id,
  o.account_id,
  o.rep_user_id,
  o.season_id,
  o.status,
  (o.created_at AT TIME ZONE 'UTC')::date AS order_date,
  COUNT(*)::int                           AS order_count,
  COALESCE(SUM(o.total_amount), 0)        AS revenue,
  COALESCE(SUM(ol_agg.total_units), 0)::int AS units_sold
FROM orders o
LEFT JOIN LATERAL (
  SELECT SUM(ol.qty) AS total_units
  FROM order_lines ol
  WHERE ol.order_id = o.id
    AND ol.removed_at IS NULL
) ol_agg ON true
WHERE o.status != 'cancelled'
GROUP BY
  o.organization_id,
  o.brand_id,
  o.account_id,
  o.rep_user_id,
  o.season_id,
  o.status,
  (o.created_at AT TIME ZONE 'UTC')::date;

-- Brand org daily sales: pre-resolves federation so brand orgs
-- don't need to call get_brand_order_ids() at query time.
-- `source` preserves the MBISR vs BOLSR boundary.
CREATE MATERIALIZED VIEW mv_brand_sales_daily AS
SELECT
  b.organization_id                       AS brand_org_id,
  o.brand_id,
  o.account_id,
  o.rep_user_id,
  o.season_id,
  o.status,
  CASE
    WHEN o.organization_id = b.organization_id THEN 'in_house'
    ELSE 'agency'
  END                                     AS source,
  o.organization_id                       AS rep_org_id,
  (o.created_at AT TIME ZONE 'UTC')::date AS order_date,
  COUNT(*)::int                           AS order_count,
  COALESCE(SUM(o.total_amount), 0)        AS revenue,
  COALESCE(SUM(ol_agg.total_units), 0)::int AS units_sold
FROM orders o
JOIN brands b ON b.id = o.brand_id
LEFT JOIN LATERAL (
  SELECT SUM(ol.qty) AS total_units
  FROM order_lines ol
  WHERE ol.order_id = o.id
    AND ol.removed_at IS NULL
) ol_agg ON true
WHERE o.status != 'cancelled'
  AND (
    -- BOLSR: order placed inside the brand's own org
    o.organization_id = b.organization_id
    OR
    -- MBISR: order federated into the brand org
    EXISTS (
      SELECT 1 FROM federated_order_links fol
      WHERE fol.order_id = o.id
        AND fol.target_org_id = b.organization_id
        AND fol.status = 'active'
    )
  )
GROUP BY
  b.organization_id,
  o.brand_id,
  o.account_id,
  o.rep_user_id,
  o.season_id,
  o.status,
  o.organization_id,
  (o.created_at AT TIME ZONE 'UTC')::date;

-- Rep view indexes
CREATE INDEX idx_mv_rep_sales_daily_org_date
  ON mv_rep_sales_daily (organization_id, order_date);
CREATE INDEX idx_mv_rep_sales_daily_org_season
  ON mv_rep_sales_daily (organization_id, season_id);
CREATE INDEX idx_mv_rep_sales_daily_org_brand
  ON mv_rep_sales_daily (organization_id, brand_id);

-- Brand view indexes
CREATE INDEX idx_mv_brand_sales_daily_org_date
  ON mv_brand_sales_daily (brand_org_id, order_date);
CREATE INDEX idx_mv_brand_sales_daily_org_season
  ON mv_brand_sales_daily (brand_org_id, season_id);
CREATE INDEX idx_mv_brand_sales_daily_org_brand
  ON mv_brand_sales_daily (brand_org_id, brand_id);

-- pg_cron refresh jobs (every 15 minutes)
-- Guarded: pg_cron is available on hosted Supabase but not local CLI instances
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'refresh_mv_rep_sales_daily',
      '*/15 * * * *',
      'REFRESH MATERIALIZED VIEW mv_rep_sales_daily'
    );
    PERFORM cron.schedule(
      'refresh_mv_brand_sales_daily',
      '*/15 * * * *',
      'REFRESH MATERIALIZED VIEW mv_brand_sales_daily'
    );
  END IF;
END
$$;
