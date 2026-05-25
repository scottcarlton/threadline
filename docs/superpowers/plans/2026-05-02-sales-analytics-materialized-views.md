# Sales Analytics Materialized Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-compute daily sales aggregates into materialized views so the AI assistant can answer time-scoped questions ("this month", "Q2", "last 30 days") instantly without scanning raw orders.

**Architecture:** Two materialized views — `mv_rep_sales_daily` (for rep orgs, scoped by `orders.organization_id`) and `mv_brand_sales_daily` (for brand orgs, pre-resolves federation via `get_brand_order_ids()`). Both use daily grain with `order_date`, `season_id`, `brand_id`, `account_id`, and `rep_user_id` dimensions. A pg_cron job refreshes every 15 minutes. A new `get_sales_analytics` RPC accepts `date_from`/`date_to`/`season_id`/`group_by` and queries the appropriate view based on org type. The AI tools call this single RPC instead of scanning raw orders.

**Tech Stack:** PostgreSQL (materialized views, pg_cron), Supabase migrations, TypeScript (AI tool definitions + implementations)

---

### Task 1: Create the materialized views migration

**Files:**

- Create: `supabase/migrations/20260502000002_sales_analytics_views.sql`

This migration creates both materialized views, their indexes, and the pg_cron refresh job.

- [ ] **Step 1: Create the migration file with `mv_rep_sales_daily`**

```sql
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
```

- [ ] **Step 2: Add `mv_brand_sales_daily` to the same migration**

This view pre-resolves federation. Brand orgs see both in-house (BOLSR) and agency (MBISR) orders.

```sql
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
```

- [ ] **Step 3: Add indexes for common query patterns**

```sql
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
```

- [ ] **Step 4: Add pg_cron refresh job (every 15 minutes)**

```sql
-- Refresh both views every 15 minutes via pg_cron.
-- CONCURRENTLY requires a UNIQUE INDEX — but our views don't have one,
-- so we use plain REFRESH. The view is small enough that a brief lock
-- during refresh is acceptable at current data volumes.
SELECT cron.schedule(
  'refresh_mv_rep_sales_daily',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW mv_rep_sales_daily$$
);

SELECT cron.schedule(
  'refresh_mv_brand_sales_daily',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW mv_brand_sales_daily$$
);
```

- [ ] **Step 5: Verify the migration applies cleanly on local Supabase**

Run: `cd /Users/scottcarlton/Sites/threadline/.worktrees/chore-ai-sweep-v1 && bunx supabase db reset`
Expected: Migration applies without errors. Both views exist (check with `\dm` in psql).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260502000002_sales_analytics_views.sql
git commit -m "feat(db): add mv_rep_sales_daily and mv_brand_sales_daily materialized views

Pre-compute daily sales aggregates for fast AI analytics queries.
Rep view scopes by organization_id, brand view pre-resolves federation.
pg_cron refreshes both every 15 minutes."
```

---

### Task 2: Create the `get_sales_analytics` RPC

**Files:**

- Create: `supabase/migrations/20260502000003_sales_analytics_rpc.sql`

A single RPC that the AI tools call. It picks the right view based on org type and supports date range, season, and group-by.

- [ ] **Step 1: Create the RPC migration**

```sql
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
```

- [ ] **Step 2: Verify the RPC works on local Supabase**

Run: `cd /Users/scottcarlton/Sites/threadline/.worktrees/chore-ai-sweep-v1 && bunx supabase db reset`

Then test with psql:

```sql
-- Should return totals for an org
SELECT get_sales_analytics(
  '<some-org-id>',
  'rep',
  '2026-05-01'::date,
  '2026-05-31'::date
);

-- Should return grouped by brand
SELECT get_sales_analytics(
  '<some-org-id>',
  'rep',
  NULL, NULL, NULL, NULL, NULL, NULL,
  'brand'
);
```

Expected: JSON results with revenue, order_count, units_sold, avg_order_value.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502000003_sales_analytics_rpc.sql
git commit -m "feat(db): add get_sales_analytics RPC for AI-powered date-range queries

Single entry point that queries the correct materialized view based
on org type. Supports date_from/date_to, season, brand, account,
rep filtering and group_by dimensions."
```

---

### Task 3: Wire the AI tool definition

**Files:**

- Modify: `src/routes/api/ai/+server.ts` — update `get_dashboard_metrics` tool definition, add `get_sales_analytics` tool definition

- [ ] **Step 1: Add the `get_sales_analytics` tool definition**

In `src/routes/api/ai/+server.ts`, add this tool definition after the existing `get_sales_report` entry (around line 550):

```typescript
{
  name: 'get_sales_analytics',
  description:
    'Fast, pre-computed sales analytics with date range support. Use this for any time-scoped sales question ("this month", "Q2", "last 30 days", "May vs April"). Returns revenue, order count, units sold, and avg order value. Can group by brand, account, rep, season, date, status, or source (in-house vs agency — brand orgs only). Prefer this over get_dashboard_metrics and get_sales_report for any question involving a time period.',
  input_schema: {
    type: 'object' as const,
    properties: {
      date_from: {
        type: 'string',
        description:
          'Start date in YYYY-MM-DD format. Derive from natural language: "this month" → first day of current month, "Q2 2026" → 2026-04-01, "last 30 days" → today minus 30.'
      },
      date_to: {
        type: 'string',
        description:
          'End date in YYYY-MM-DD format. Derive from natural language: "this month" → today or last day of month, "Q2 2026" → 2026-06-30.'
      },
      season_name: {
        type: 'string',
        description: 'Filter by season name (fuzzy match). E.g. "Fall", "Spring 2026".'
      },
      brand_name: {
        type: 'string',
        description: 'Filter by brand name (fuzzy match).'
      },
      account_name: {
        type: 'string',
        description: 'Filter by account name (fuzzy match).'
      },
      rep_name: {
        type: 'string',
        description: 'Filter by rep name (fuzzy match).'
      },
      group_by: {
        type: 'string',
        enum: ['total', 'brand', 'account', 'rep', 'season', 'date', 'status', 'source'],
        description:
          'How to group results. "total" returns a single aggregate. "date" returns one row per day. "source" splits in-house vs agency (brand orgs only). Default: "total".'
      }
    },
    required: []
  }
}
```

- [ ] **Step 2: Add `get_sales_analytics` to the guest-allowed tools list**

In the dynamic system prompt (around line 946), add `get_sales_analytics` to the read-only tools list:

```typescript
// Find this string:
'Only use query_data, list_brands, list_accounts, get_dashboard_metrics, get_sales_report, get_commission_report, and get_style_velocity.';
// Replace with:
'Only use query_data, list_brands, list_accounts, get_dashboard_metrics, get_sales_report, get_sales_analytics, get_commission_report, and get_style_velocity.';
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/ai/+server.ts
git commit -m "feat(ai): add get_sales_analytics tool definition

New tool with date_from/date_to, season, brand, account, rep filters
and flexible group_by. Backed by materialized views for fast queries."
```

---

### Task 4: Implement the `getSalesAnalytics` tool handler

**Files:**

- Modify: `src/lib/server/ai-tools.ts` — add `getSalesAnalytics` function and wire it into the tool router

- [ ] **Step 1: Add the case to the tool router**

In `src/lib/server/ai-tools.ts`, find the `case 'get_sales_report':` block (around line 118) and add after it:

```typescript
case 'get_sales_analytics':
  return getSalesAnalytics(toolInput, ctx);
```

- [ ] **Step 2: Implement `getSalesAnalytics`**

Add this function near the existing `getSalesReport` function (around line 1550):

```typescript
async function getSalesAnalytics(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		// Resolve fuzzy names to IDs
		let seasonId: string | null = null;
		let brandId: string | null = null;
		let accountId: string | null = null;
		let repUserId: string | null = null;

		if (input.season_name) {
			const { data: seasons } = await ctx.supabase
				.from('seasons')
				.select('id')
				.eq('organization_id', ctx.organizationId)
				.ilike('name', `%${input.season_name as string}%`)
				.limit(1);
			if (seasons?.[0]) seasonId = seasons[0].id;
			else return { success: false, error: `Season "${input.season_name}" not found.` };
		}

		if (input.brand_name) {
			let brandQuery = ctx.supabase
				.from('brands')
				.select('id')
				.ilike('name', `%${input.brand_name as string}%`)
				.limit(1);
			if (ctx.brandScope) brandQuery = brandQuery.in('id', ctx.brandScope);
			const { data: brands } = await brandQuery;
			if (brands?.[0]) brandId = brands[0].id;
			else return { success: false, error: `Brand "${input.brand_name}" not found.` };
		}

		if (input.account_name) {
			const { data: accounts } = await ctx.supabase
				.from('accounts')
				.select('id')
				.eq('organization_id', ctx.organizationId)
				.ilike('business_name', `%${input.account_name as string}%`)
				.limit(1);
			if (accounts?.[0]) accountId = accounts[0].id;
			else return { success: false, error: `Account "${input.account_name}" not found.` };
		}

		if (input.rep_name) {
			const { data: members } = await ctx.supabase
				.from('organization_members')
				.select('profile_id, profiles!organization_members_profile_id_fkey(display_name)')
				.eq('organization_id', ctx.organizationId);
			type MemberRow = {
				profile_id: string;
				profiles?: { display_name?: string } | { display_name?: string }[] | null;
			};
			const match = (members as MemberRow[] | null)?.find((m) => {
				const p = m.profiles;
				const name = Array.isArray(p) ? p[0]?.display_name : p?.display_name;
				return name?.toLowerCase().includes((input.rep_name as string).toLowerCase());
			});
			if (match) repUserId = match.profile_id;
			else return { success: false, error: `Rep "${input.rep_name}" not found.` };
		}

		const { data, error } = await ctx.supabase.rpc('get_sales_analytics', {
			p_org_id: ctx.organizationId,
			p_org_type: ctx.orgType,
			p_date_from: (input.date_from as string) ?? null,
			p_date_to: (input.date_to as string) ?? null,
			p_season_id: seasonId,
			p_brand_id: brandId,
			p_account_id: accountId,
			p_rep_user_id: repUserId,
			p_group_by: (input.group_by as string) ?? 'total'
		});

		if (error) return { success: false, error: error.message };

		return {
			success: true,
			data: {
				filters: {
					date_from: input.date_from ?? null,
					date_to: input.date_to ?? null,
					season: input.season_name ?? null,
					brand: input.brand_name ?? null,
					account: input.account_name ?? null,
					rep: input.rep_name ?? null
				},
				group_by: input.group_by ?? 'total',
				results: data
			}
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to get sales analytics'
		};
	}
}
```

- [ ] **Step 3: Verify `ctx.orgType` is available in ToolContext**

Check that `ToolContext` includes `orgType`. Search for the type definition:

```bash
grep -n 'ToolContext' src/lib/server/ai-tools.ts | head -5
```

If `orgType` is not on `ToolContext`, add it. The org type is available in the API route as `locals.orgType` — pass it through when constructing the context object.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/ai-tools.ts
git commit -m "feat(ai): implement getSalesAnalytics tool handler

Resolves fuzzy names to IDs, calls get_sales_analytics RPC,
returns filtered + grouped sales data from materialized views."
```

---

### Task 5: Update the AI system prompt for time-aware queries

**Files:**

- Modify: `src/lib/server/ai-prompts.ts`

- [ ] **Step 1: Add time-range instructions to `MAIN_STATIC_PROMPT`**

In `src/lib/server/ai-prompts.ts`, add this section after the existing rule 14 (notes vs orders):

```typescript
// Add after rule 14:
15. Time-scoped sales queries: When a user asks about sales for a time period ("this month", "Q2", "last week", "May vs April"), ALWAYS use get_sales_analytics with date_from and date_to. Convert natural language to date boundaries:
   - "this month" → first day of current month to today
   - "last month" → first to last day of prior month
   - "this quarter" / "Q2 2026" → quarter start to quarter end (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)
   - "this year" → Jan 1 to today
   - "last 30 days" → today minus 30 to today
   - "May vs April" → call get_sales_analytics twice with each month's boundaries and compare
   - Seasonal queries ("Fall 2025 sales") → use season_name filter instead of date range
   Use get_dashboard_metrics only for non-time-scoped overview metrics (total active brands, accounts). For any revenue or order count question with a time component, use get_sales_analytics.
```

- [ ] **Step 2: Bump the prompt version**

```typescript
// Change:
export const PROMPT_VERSION = '2.4.0';
// To:
export const PROMPT_VERSION = '2.5.0';
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/ai-prompts.ts
git commit -m "feat(ai): add time-range resolution instructions to system prompt

Teaches the AI to convert 'this month', 'Q2', 'last 30 days' etc.
into date_from/date_to params for get_sales_analytics. Bump prompt
version to 2.5.0."
```

---

### Task 6: Pass `orgType` through to ToolContext (if needed)

**Files:**

- Modify: `src/lib/server/ai-tools.ts` (ToolContext type)
- Modify: `src/routes/api/ai/+server.ts` (context construction)

- [ ] **Step 1: Check if `orgType` already exists on ToolContext**

```bash
grep -n 'interface ToolContext\|type ToolContext\|orgType' src/lib/server/ai-tools.ts
```

- [ ] **Step 2: If missing, add `orgType` to ToolContext**

In the ToolContext type definition, add:

```typescript
orgType: 'rep' | 'brand';
```

- [ ] **Step 3: Pass `orgType` when constructing the context in the API route**

In `src/routes/api/ai/+server.ts`, find where the ToolContext is constructed (search for `organizationId`) and add:

```typescript
orgType: locals.orgType,
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/ai-tools.ts src/routes/api/ai/+server.ts
git commit -m "feat(ai): pass orgType through ToolContext for view selection"
```

---

### Task 7: Type check and test

**Files:**

- No new files — verification only

- [ ] **Step 1: Run type checking**

Run: `cd /Users/scottcarlton/Sites/threadline/.worktrees/chore-ai-sweep-v1 && bun run check`
Expected: 0 errors

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/scottcarlton/Sites/threadline/.worktrees/chore-ai-sweep-v1 && bun run test:run`
Expected: All tests pass

- [ ] **Step 3: Reset local Supabase and verify views exist**

Run: `cd /Users/scottcarlton/Sites/threadline/.worktrees/chore-ai-sweep-v1 && bunx supabase db reset`

Then verify:

```bash
bunx supabase db execute --local "SELECT count(*) FROM mv_rep_sales_daily; SELECT count(*) FROM mv_brand_sales_daily;"
```

Expected: Queries succeed (counts may be 0 if seed data has no orders).

- [ ] **Step 4: Test the RPC end-to-end via local Supabase**

```bash
bunx supabase db execute --local "SELECT get_sales_analytics('<org-id>', 'rep', '2026-05-01', '2026-05-31', NULL, NULL, NULL, NULL, 'total');"
```

Expected: Returns JSON with revenue, order_count, units_sold, avg_order_value.

- [ ] **Step 5: Commit any fixes**

If type check or tests required fixes, commit them:

```bash
git add -A
git commit -m "fix: address type check and test issues from sales analytics integration"
```
