# Brand Reports Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two brand-side reports (`sales-by-rep-agency`, `product-performance`) on the existing `/reports` route, using federation (`federated_order_links`) and a new per-brand style-velocity DB function.

**Architecture:** Role-aware `/reports` — index page branches the template list by org type. Detail route `[slug]/+page.server.ts` gets an allow-list per org type and two new case branches. A new `get_style_velocity_for_brand` DB function mirrors `get_style_velocity` but scopes orders through `federated_order_links`.

**Tech Stack:** SvelteKit 5, Svelte 5 runes, TypeScript, Supabase (Postgres + RLS), Tailwind v4, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-04-17-brand-reports-phase-1-design.md`

**Branch / worktree:** `sco-126-brand-reports` at `/Users/scottcarlton/Sites/threadline/.worktrees/sco-126-brand-reports/`

**Linear:** SCO-127 (Sales by Rep Agency), SCO-128 (Product Performance). SCO-126 is umbrella — stays open.

---

## Task 0: Verify unknowns (no code)

**Files:** none (read-only discovery)

- [ ] **Step 1: Verify how brand orgs are discriminated from rep orgs**

Grep for how `organizations` table distinguishes types.

```bash
grep -rn "organizations" supabase/migrations/ | grep -i "type\|kind\|role" | head -30
grep -rn "org_type\|organization_type" src/ | head -20
```

Capture findings:

- Column name (expect: `organizations.type`, values like `'rep'` / `'brand'` — verify).
- Whether `locals.organization` already exposes this (check `src/hooks.server.ts` around lines 103–147, and `src/app.d.ts`).
- If NOT surfaced on `locals.organization`, note the column so the server load can read it directly.

- [ ] **Step 2: Verify `org_connections` table shape**

```bash
grep -rn "org_connections" supabase/migrations/ | head -10
```

Read the migration that creates the table. Confirm these columns exist: `id`, `rep_org_id`, `brand_org_id`, `status`. If column names differ, update Tasks 3 accordingly.

- [ ] **Step 3: Verify `federated_order_links` table shape**

```bash
grep -rn "federated_order_links" supabase/migrations/ | head -10
```

Confirm columns: `order_id`, `source_org_id`, `target_org_id`, `status`, `connection_id`. Read the `auto_federate_order()` trigger to confirm ordering.

- [ ] **Step 4: Verify brand-side RLS allows reading `organizations.name` for connected rep orgs**

Read `docs/brd/permissions-implementation-map.md` §A.4 for the `organizations` row. Confirm that a brand user can SELECT `organizations` rows for rep orgs they have an active connection with. If not, Task 3 needs a workaround (e.g., join through `org_connections` via an RLS-friendly path, or add a view).

- [ ] **Step 5: Read the rbac-change skill before SQL**

Invoke `.claude/skills/rbac-change` and walk its preflight checklist. Note decisions in a scratch comment at the top of Task 6.

- [ ] **Step 6: Pin findings**

Before proceeding, in this chat summarize: (a) the exact column/path used to identify brand orgs, (b) any shape deltas from assumptions in this plan, (c) the RLS path for reading rep org names from the brand side. These determine whether the code snippets in Tasks 1–4 need adjustment.

---

## Task 1: Role-aware `/reports` index

**Files:**

- Modify: `src/routes/reports/+page.svelte`
- Modify: `src/routes/reports/+page.server.ts` (to pass org type into the page)

- [ ] **Step 1: Update the server load to expose org type**

Replace `src/routes/reports/+page.server.ts` with:

```ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgType = locals.organization?.type ?? null;
	return { orgType };
};
```

If Task 0 found the type lives elsewhere (not `locals.organization.type`), read it here instead (e.g., a direct `supabase.from('organizations').select('type').eq('id', orgId).single()`).

- [ ] **Step 2: Branch the template list by org type in `+page.svelte`**

Replace the top `<script>` block:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const repReports = [
		{
			id: 'sales-by-brand',
			title: 'Sales by Brand',
			description: 'Total sales broken down by brand for a given period'
		},
		{
			id: 'sales-by-account',
			title: 'Sales by Account',
			description: 'Revenue per account with YTD comparisons'
		},
		{
			id: 'sales-by-territory',
			title: 'Sales by Territory',
			description: 'Territory performance with account and rep breakdown'
		},
		{
			id: 'sales-by-rep',
			title: 'Sales by Rep',
			description: 'Individual rep performance across all brands'
		},
		{
			id: 'commission',
			title: 'Commission Report',
			description: 'Brand and rep commissions by order, with shipped amounts'
		},
		{
			id: 'pipeline',
			title: 'Order Pipeline',
			description: 'Orders grouped by status with totals'
		},
		{
			id: 'season-comparison',
			title: 'Season Comparison',
			description: 'Compare order volume and revenue across seasons'
		},
		{
			id: 'show-performance',
			title: 'Show Performance',
			description: 'ROI per show — orders, new accounts, and appointments'
		}
	];

	const brandReports = [
		{
			id: 'sales-by-rep-agency',
			title: 'Sales by Rep Agency',
			description: 'Revenue and order count per connected rep org'
		},
		{
			id: 'product-performance',
			title: 'Product Performance',
			description: 'Style-level velocity — which products are moving across reps'
		}
	];

	const reports = $derived(data.orgType === 'brand' ? brandReports : repReports);
</script>
```

Leave the template markup below the script unchanged — it iterates `reports`.

- [ ] **Step 3: Verify via browser**

Run `bun run dev` in the worktree (if not already running) and load `/reports` as a brand-org user. Confirm you see 2 brand templates. As a rep-org user confirm you see the 8 existing templates. If you can't switch orgs without seeding data, skip and note that the gate is verified in Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/routes/reports/+page.svelte src/routes/reports/+page.server.ts
git commit -m "feat(reports): branch /reports index by org type

SCO-126"
```

---

## Task 2: Org-type gate in `[slug]/+page.server.ts`

**Files:**

- Modify: `src/routes/reports/[slug]/+page.server.ts`

- [ ] **Step 1: Add allow-list + early 404 for wrong org type**

Near the top of the file, replace `reportTitles` with:

```ts
const repReportTitles: Record<string, string> = {
	'sales-by-brand': 'Sales by Brand',
	'sales-by-account': 'Sales by Account',
	'sales-by-territory': 'Sales by Territory',
	'sales-by-rep': 'Sales by Rep',
	commission: 'Commission Report',
	pipeline: 'Order Pipeline',
	'season-comparison': 'Season Comparison',
	'show-performance': 'Show Performance'
};

const brandReportTitles: Record<string, string> = {
	'sales-by-rep-agency': 'Sales by Rep Agency',
	'product-performance': 'Product Performance'
};

function titleFor(orgType: string | null | undefined, slug: string): string | null {
	if (orgType === 'brand') return brandReportTitles[slug] ?? null;
	return repReportTitles[slug] ?? null;
}
```

- [ ] **Step 2: Replace the existing title lookup at the top of `load`**

Find the existing:

```ts
if (!reportTitles[report]) throw error(404, 'Report not found');
```

Replace with:

```ts
const orgType = locals.organization?.type ?? null;
const title = titleFor(orgType, report);
if (!title) throw error(404, 'Report not found');
```

Update the `return` in the "no organization" guard (around line 21) to use `title`:

```ts
if (!organization) return { report, title, year: new Date().getFullYear(), rows: [] };
```

Update every `title: reportTitles[report]` in the switch cases to `title`.

- [ ] **Step 3: Run type check**

```bash
bun run check
```

Expected: 0 errors. Fix any breakage caused by the rename.

- [ ] **Step 4: Commit**

```bash
git add src/routes/reports/[slug]/+page.server.ts
git commit -m "feat(reports): gate [slug] by org type with per-type allow-list

SCO-126"
```

---

## Task 3: SCO-127 — Sales by Rep Agency server load

**Files:**

- Create: `src/lib/server/reports/brand/salesByRepAgency.ts`
- Modify: `src/routes/reports/[slug]/+page.server.ts` (add case branch)
- Create: `src/lib/server/reports/brand/salesByRepAgency.test.ts`

The logic is extracted into a pure-ish module so it's testable and doesn't bloat the switch.

- [ ] **Step 1: Write the failing unit test for `computeRepAgencyRow`**

Create `src/lib/server/reports/brand/salesByRepAgency.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeRepAgencyRow } from './salesByRepAgency';

describe('computeRepAgencyRow', () => {
	it('returns zeros and inactive status when there are no orders', () => {
		const row = computeRepAgencyRow({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: []
		});
		expect(row).toEqual({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: 0,
			revenue: 0,
			avgOrderValue: 0,
			lastOrderDate: null,
			status: 'inactive'
		});
	});

	it('aggregates orders and marks active', () => {
		const row = computeRepAgencyRow({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: [
				{ total_amount: 100, created_at: '2026-02-01T00:00:00Z' },
				{ total_amount: 300, created_at: '2026-04-10T00:00:00Z' }
			]
		});
		expect(row.orders).toBe(2);
		expect(row.revenue).toBe(400);
		expect(row.avgOrderValue).toBe(200);
		expect(row.lastOrderDate).toBe('2026-04-10T00:00:00Z');
		expect(row.status).toBe('active');
	});

	it('guards divide-by-zero on AOV', () => {
		const row = computeRepAgencyRow({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: []
		});
		expect(row.avgOrderValue).toBe(0);
	});

	it('handles non-numeric total_amount strings by coercing', () => {
		const row = computeRepAgencyRow({
			repOrgId: 'rep-1',
			repOrgName: 'ACME Reps',
			orders: [{ total_amount: '250.50' as unknown as number, created_at: '2026-03-01T00:00:00Z' }]
		});
		expect(row.revenue).toBe(250.5);
		expect(row.orders).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd .worktrees/sco-126-brand-reports && bun run test:run -- salesByRepAgency
```

Expected: FAIL with `Cannot find module './salesByRepAgency'`.

- [ ] **Step 3: Implement the module**

Create `src/lib/server/reports/brand/salesByRepAgency.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type RepAgencyInput = {
	repOrgId: string;
	repOrgName: string;
	orders: Array<{ total_amount: number | string; created_at: string }>;
};

export type RepAgencyRow = {
	repOrgId: string;
	repOrgName: string;
	orders: number;
	revenue: number;
	avgOrderValue: number;
	lastOrderDate: string | null;
	status: 'active' | 'inactive';
};

export function computeRepAgencyRow(input: RepAgencyInput): RepAgencyRow {
	const count = input.orders.length;
	const revenue = input.orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
	const lastOrderDate = count
		? input.orders
				.map((o) => o.created_at)
				.sort()
				.slice(-1)[0]
		: null;
	return {
		repOrgId: input.repOrgId,
		repOrgName: input.repOrgName,
		orders: count,
		revenue,
		avgOrderValue: count ? revenue / count : 0,
		lastOrderDate,
		status: count ? 'active' : 'inactive'
	};
}

type ConnectionRow = {
	rep_org_id: string;
	organizations: { name?: string } | { name?: string }[] | null;
};

type FederatedOrderRow = {
	source_org_id: string;
	orders: { total_amount: number | string; created_at: string } | null;
};

/**
 * Brand-side query: connected rep orgs × orders federated to this brand, scoped to a year.
 * Does NOT filter by organization_id on orders — federation view per permissions-implementation-map §A.4.
 */
export async function loadSalesByRepAgency(
	supabase: SupabaseClient,
	brandOrgId: string,
	year: number
): Promise<RepAgencyRow[]> {
	const [connectionsRes, linksRes] = await Promise.all([
		supabase
			.from('org_connections')
			.select('rep_org_id, organizations:rep_org_id(name)')
			.eq('brand_org_id', brandOrgId)
			.eq('status', 'active'),
		supabase
			.from('federated_order_links')
			.select('source_org_id, orders!inner(total_amount, created_at, order_year, status)')
			.eq('target_org_id', brandOrgId)
			.eq('status', 'active')
			.eq('orders.order_year', year)
			.neq('orders.status', 'cancelled')
	]);

	const connections = ((connectionsRes.data ?? []) as ConnectionRow[]).map((c) => ({
		rep_org_id: c.rep_org_id,
		name:
			(Array.isArray(c.organizations) ? c.organizations[0]?.name : c.organizations?.name) ??
			'Unknown'
	}));

	const ordersByRep = new Map<
		string,
		Array<{ total_amount: number | string; created_at: string }>
	>();
	for (const link of (linksRes.data ?? []) as FederatedOrderRow[]) {
		const order = link.orders;
		if (!order) continue;
		const list = ordersByRep.get(link.source_org_id) ?? [];
		list.push({ total_amount: order.total_amount, created_at: order.created_at });
		ordersByRep.set(link.source_org_id, list);
	}

	return connections
		.map((conn) =>
			computeRepAgencyRow({
				repOrgId: conn.rep_org_id,
				repOrgName: conn.name,
				orders: ordersByRep.get(conn.rep_org_id) ?? []
			})
		)
		.sort((a, b) => b.revenue - a.revenue);
}
```

Note: if Task 0 Step 4 found that brand users cannot read `organizations.name` for rep orgs via the implicit FK join, swap the `organizations:rep_org_id(name)` select for a secondary `supabase.from('organizations').select('id, name').in('id', repOrgIds)` query after fetching the connection IDs, and merge by id.

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test:run -- salesByRepAgency
```

Expected: all 4 pass.

- [ ] **Step 5: Wire the case branch in `[slug]/+page.server.ts`**

Inside the switch statement, add after the existing rep cases:

```ts
case 'sales-by-rep-agency': {
	const { loadSalesByRepAgency } = await import(
		'$lib/server/reports/brand/salesByRepAgency'
	);
	const rows = await loadSalesByRepAgency(supabase, orgId, year);
	return { report, title, year, rows };
}
```

- [ ] **Step 6: Run type check**

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/reports/brand/salesByRepAgency.ts \
        src/lib/server/reports/brand/salesByRepAgency.test.ts \
        src/routes/reports/[slug]/+page.server.ts
git commit -m "feat(reports): add brand Sales by Rep Agency server load + tests

Closes SCO-127"
```

---

## Task 4: SCO-127 — render block

**Files:**

- Modify: `src/routes/reports/[slug]/+page.svelte`

- [ ] **Step 1: Add the render block**

Add a new `{:else if data.report === 'sales-by-rep-agency'}` branch alongside the existing per-report blocks. Structure:

```svelte
{:else if data.report === 'sales-by-rep-agency'}
	{#if data.rows.length === 0}
		<div class="flex flex-col items-center gap-3 py-16 text-center">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
					/>
				</svg>
			</div>
			<p class="text-sm font-medium">No connected rep agencies yet</p>
			<p class="text-sm text-muted-foreground">
				Invite reps to carry your brand and their sales will appear here.
			</p>
		</div>
	{:else}
		<table class="w-full border-collapse text-sm">
			<thead>
				<tr class="border-b">
					<th class="py-2 text-left font-medium">Rep Agency</th>
					<th class="py-2 text-right font-medium">Orders</th>
					<th class="py-2 text-right font-medium">Revenue</th>
					<th class="py-2 text-right font-medium">Avg Order Value</th>
					<th class="py-2 text-left font-medium">Last Order</th>
					<th class="py-2 text-left font-medium">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row}
					<tr class="border-b">
						<td class="py-2">{row.repOrgName}</td>
						<td class="py-2 text-right">{row.orders}</td>
						<td class="py-2 text-right">{currency(row.revenue)}</td>
						<td class="py-2 text-right">{currency(row.avgOrderValue)}</td>
						<td class="py-2">{row.lastOrderDate ? formatDate(row.lastOrderDate) : '—'}</td>
						<td class="py-2 capitalize">{row.status}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
```

Inline `formatDate` next to the existing `currency` helper at the top of the `<script>`:

```ts
function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}
```

- [ ] **Step 2: CSV export — confirm the existing button works**

The existing page already has a CSV button hooked to `downloadCSV(data.rows, ...)`. Verify it serializes the new row shape correctly by clicking it in the browser. If the column order looks off, add a `sales-by-rep-agency` branch to whichever CSV helper is in use to format it.

- [ ] **Step 3: Run type check**

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 4: Manual browser verification**

- As a brand-org user, visit `/reports/sales-by-rep-agency`.
- Verify the table renders all active connections.
- Verify a zero-order rep appears with `0`, `$0.00`, `—`, `inactive`.
- Click Export CSV and confirm the file downloads with expected columns.

- [ ] **Step 5: Commit**

```bash
git add src/routes/reports/[slug]/+page.svelte
git commit -m "feat(reports): render Sales by Rep Agency table + empty state

Closes SCO-127"
```

---

## Task 5: New migration — `get_style_velocity_for_brand`

**Files:**

- Create: `supabase/migrations/<next-timestamp>_style_velocity_for_brand.sql`

- [ ] **Step 1: Generate a new migration timestamp**

```bash
ls -1 supabase/migrations | tail -5
```

Pick a timestamp strictly greater than the latest (prefer a fresh `YYYYMMDDHHMMSS` matching today, e.g. `20260417120000`). Name: `<timestamp>_style_velocity_for_brand.sql`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/<timestamp>_style_velocity_for_brand.sql`:

```sql
-- ============================================================
-- Style Velocity for Brand (federation-aware)
-- Mirrors get_style_velocity, but scopes orders via federated_order_links
-- so a brand can see style-level performance across all connected rep orgs.
-- ============================================================

CREATE OR REPLACE FUNCTION get_style_velocity_for_brand(
  brand_org_id UUID,
  days_back INTEGER DEFAULT 90,
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
      MAX(o.created_at) AS latest_ordered
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id
    JOIN federated_order_links fol
      ON fol.order_id = o.id
      AND fol.target_org_id = brand_org_id
      AND fol.status = 'active'
    JOIN brands b ON b.id = o.brand_id
    LEFT JOIN products p ON p.id = ol.product_id
    WHERE o.brand_id = brand_org_id
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

GRANT EXECUTE ON FUNCTION get_style_velocity_for_brand(UUID, INTEGER, INTEGER) TO authenticated;
```

Note: the existing `get_style_velocity` includes a `top_colors` subquery. Phase 1 omits it to keep the function simpler — SCO-128 doesn't list colors as a column. Add back if the UI later needs color chips.

Verify `o.brand_id` is the correct column name by grepping `supabase/migrations/` for the orders table definition. If it's named differently (e.g. `brand_organization_id`), adjust.

- [ ] **Step 3: Apply to LOCAL Supabase**

Per memory: local Supabase runs at `127.0.0.1:54322`. Use the Supabase CLI against the local project — do NOT push to the remote via the MCP.

```bash
bun run supabase db reset --local
```

Or, if a targeted apply is preferred and the CLI supports it in this repo:

```bash
bunx supabase migration up --local
```

Expected: migration applies with no error. If it fails on a column name, fix and reapply.

- [ ] **Step 4: Smoke-test the function**

Using the local Supabase SQL editor or `psql`:

```sql
SELECT get_style_velocity_for_brand('<some-brand-org-id>'::uuid, 90, 1);
```

Expected: JSON array (possibly empty). No error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<timestamp>_style_velocity_for_brand.sql
git commit -m "feat(db): add get_style_velocity_for_brand federation-scoped fn

SCO-128"
```

---

## Task 6: SCO-128 — Product Performance server load + trend helper

**Files:**

- Create: `src/lib/server/reports/brand/productPerformance.ts`
- Create: `src/lib/server/reports/brand/productPerformance.test.ts`
- Modify: `src/routes/reports/[slug]/+page.server.ts` (add case branch)

- [ ] **Step 1: Write the failing unit test for `classifyTrend`**

Create `src/lib/server/reports/brand/productPerformance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyTrend, buildProductPerformanceRows } from './productPerformance';

describe('classifyTrend', () => {
	it('returns "up" when current exceeds prior by >10%', () => {
		expect(classifyTrend(110, 100)).toBe('up');
		expect(classifyTrend(200, 100)).toBe('up');
	});

	it('returns "down" when current trails prior by >10%', () => {
		expect(classifyTrend(80, 100)).toBe('down');
		expect(classifyTrend(0, 100)).toBe('down');
	});

	it('returns "flat" when change is within +/- 10%', () => {
		expect(classifyTrend(100, 100)).toBe('flat');
		expect(classifyTrend(105, 100)).toBe('flat');
		expect(classifyTrend(95, 100)).toBe('flat');
	});

	it('returns "up" when prior is zero and current is positive (new style)', () => {
		expect(classifyTrend(10, 0)).toBe('up');
	});

	it('returns "flat" when both zero', () => {
		expect(classifyTrend(0, 0)).toBe('flat');
	});
});

describe('buildProductPerformanceRows', () => {
	it('joins current and prior windows on style_number, computes velocity and trend', () => {
		const current = [
			{
				style_number: 'S-1',
				product_name: 'Alpha',
				brand_name: 'B',
				account_count: 5,
				order_count: 8,
				total_qty: 100,
				total_revenue: 1000,
				avg_qty_per_account: 20
			}
		];
		const prior = [
			{
				style_number: 'S-1',
				product_name: 'Alpha',
				brand_name: 'B',
				account_count: 4,
				order_count: 6,
				total_qty: 80,
				total_revenue: 800,
				avg_qty_per_account: 20
			}
		];
		const rows = buildProductPerformanceRows(current, prior);
		expect(rows).toHaveLength(1);
		expect(rows[0].styleNumber).toBe('S-1');
		expect(rows[0].velocityScore).toBe(100); // 5 * 20
		expect(rows[0].trend).toBe('up'); // 100 vs 80 = +25%
	});

	it('treats prior-only styles as dropped and includes them with trend=down', () => {
		const current: Parameters<typeof buildProductPerformanceRows>[0] = [];
		const prior = [
			{
				style_number: 'S-2',
				product_name: 'Beta',
				brand_name: 'B',
				account_count: 3,
				order_count: 5,
				total_qty: 50,
				total_revenue: 500,
				avg_qty_per_account: 16.7
			}
		];
		const rows = buildProductPerformanceRows(current, prior);
		expect(rows).toHaveLength(1);
		expect(rows[0].styleNumber).toBe('S-2');
		expect(rows[0].unitsOrdered).toBe(0);
		expect(rows[0].trend).toBe('down');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run test:run -- productPerformance
```

Expected: FAIL with `Cannot find module './productPerformance'`.

- [ ] **Step 3: Implement the module**

Create `src/lib/server/reports/brand/productPerformance.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type VelocityRow = {
	style_number: string;
	product_name: string;
	brand_name: string;
	account_count: number;
	order_count: number;
	total_qty: number;
	total_revenue: number;
	avg_qty_per_account: number;
};

export type ProductPerformanceRow = {
	styleNumber: string;
	productName: string;
	unitsOrdered: number;
	revenue: number;
	accounts: number;
	velocityScore: number;
	trend: 'up' | 'down' | 'flat';
};

export function classifyTrend(current: number, prior: number): 'up' | 'down' | 'flat' {
	if (current === 0 && prior === 0) return 'flat';
	if (prior === 0) return current > 0 ? 'up' : 'flat';
	const ratio = (current - prior) / prior;
	if (ratio > 0.1) return 'up';
	if (ratio < -0.1) return 'down';
	return 'flat';
}

export function buildProductPerformanceRows(
	current: VelocityRow[],
	prior: VelocityRow[]
): ProductPerformanceRow[] {
	const priorByStyle = new Map(prior.map((r) => [r.style_number, r]));
	const currentByStyle = new Map(current.map((r) => [r.style_number, r]));

	const allStyles = new Set<string>([...currentByStyle.keys(), ...priorByStyle.keys()]);

	return Array.from(allStyles)
		.map((style) => {
			const c = currentByStyle.get(style);
			const p = priorByStyle.get(style);
			const anchor = c ?? p!;
			const unitsCurrent = c?.total_qty ?? 0;
			const unitsPrior = p?.total_qty ?? 0;
			return {
				styleNumber: anchor.style_number,
				productName: anchor.product_name,
				unitsOrdered: unitsCurrent,
				revenue: c?.total_revenue ?? 0,
				accounts: c?.account_count ?? 0,
				velocityScore: (c?.account_count ?? 0) * (c?.avg_qty_per_account ?? 0),
				trend: classifyTrend(unitsCurrent, unitsPrior)
			};
		})
		.sort((a, b) => b.velocityScore - a.velocityScore);
}

export async function loadProductPerformance(
	supabase: SupabaseClient,
	brandOrgId: string,
	daysBack: number
): Promise<ProductPerformanceRow[]> {
	const [currentRes, priorRes] = await Promise.all([
		supabase.rpc('get_style_velocity_for_brand', {
			brand_org_id: brandOrgId,
			days_back: daysBack,
			min_accounts: 1
		}),
		supabase.rpc('get_style_velocity_for_brand', {
			brand_org_id: brandOrgId,
			days_back: daysBack * 2,
			min_accounts: 1
		})
	]);

	const currentAll = (currentRes.data ?? []) as VelocityRow[];
	const priorPlusCurrent = (priorRes.data ?? []) as VelocityRow[];

	// prior window = orders that appeared in the double-length window but not in the current window
	const currentStyles = new Set(currentAll.map((r) => r.style_number));
	const priorOnly = priorPlusCurrent.filter((r) => {
		const matchedInCurrent = currentAll.find((c) => c.style_number === r.style_number);
		if (!matchedInCurrent) return true;
		// style exists in both windows; prior-window totals = double - current
		return false;
	});

	// Compute prior-window totals per style by subtracting current from the double window.
	const priorByStyle = new Map<string, VelocityRow>();
	for (const r of priorPlusCurrent) {
		const c = currentAll.find((cr) => cr.style_number === r.style_number);
		if (c) {
			priorByStyle.set(r.style_number, {
				...r,
				account_count: Math.max(0, r.account_count - c.account_count),
				order_count: Math.max(0, r.order_count - c.order_count),
				total_qty: Math.max(0, r.total_qty - c.total_qty),
				total_revenue: Math.max(0, r.total_revenue - c.total_revenue)
			});
		} else {
			priorByStyle.set(r.style_number, r);
		}
	}
	// Ensure prior-only set is represented.
	for (const r of priorOnly) {
		if (!priorByStyle.has(r.style_number)) priorByStyle.set(r.style_number, r);
	}

	return buildProductPerformanceRows(currentAll, Array.from(priorByStyle.values()));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run test:run -- productPerformance
```

Expected: 6 passing (5 classifyTrend + 1 buildProductPerformanceRows with 2 cases… recount: `classifyTrend` has 5 cases, `buildProductPerformanceRows` has 2 cases = 7 total).

- [ ] **Step 5: Wire the case branch in `[slug]/+page.server.ts`**

Inside the switch statement, add:

```ts
case 'product-performance': {
	const { loadProductPerformance } = await import(
		'$lib/server/reports/brand/productPerformance'
	);
	const daysBack = parseInt(url.searchParams.get('days') ?? '') || 90;
	const rows = await loadProductPerformance(supabase, orgId, daysBack);
	return { report, title, year, rows, daysBack };
}
```

- [ ] **Step 6: Run type check**

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/reports/brand/productPerformance.ts \
        src/lib/server/reports/brand/productPerformance.test.ts \
        src/routes/reports/[slug]/+page.server.ts
git commit -m "feat(reports): add brand Product Performance server load + tests

Closes SCO-128"
```

---

## Task 7: SCO-128 — render block + days_back selector

**Files:**

- Modify: `src/routes/reports/[slug]/+page.svelte`

- [ ] **Step 1: Add a days-back selector (visible only on the product-performance slug)**

In the `<script>`, add:

```ts
function onDaysChange(e: Event) {
	const target = e.target as HTMLSelectElement;
	const url = new URL(window.location.href);
	url.searchParams.set('days', target.value);
	window.location.href = url.toString();
}
```

Above the existing year selector (or next to it) add:

```svelte
{#if data.report === 'product-performance'}
	<label class="flex items-center gap-2 text-sm">
		Window:
		<select
			class="rounded-none border bg-background px-2 py-1 text-sm"
			value={data.daysBack ?? 90}
			onchange={onDaysChange}
		>
			<option value={14}>14 days</option>
			<option value={30}>30 days</option>
			<option value={90}>90 days</option>
			<option value={180}>180 days</option>
		</select>
	</label>
{/if}
```

- [ ] **Step 2: Add the table render block**

Add a new `{:else if data.report === 'product-performance'}` branch:

```svelte
{:else if data.report === 'product-performance'}
	{#if data.rows.length === 0}
		<div class="flex flex-col items-center gap-3 py-16 text-center">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M4 6h16M4 12h16M4 18h7"
					/>
				</svg>
			</div>
			<p class="text-sm font-medium">No products moving in this window</p>
			<p class="text-sm text-muted-foreground">
				Try a longer time window or wait for more orders.
			</p>
		</div>
	{:else}
		<table class="w-full border-collapse text-sm">
			<thead>
				<tr class="border-b">
					<th class="py-2 text-left font-medium">Style #</th>
					<th class="py-2 text-left font-medium">Product</th>
					<th class="py-2 text-right font-medium">Units</th>
					<th class="py-2 text-right font-medium">Revenue</th>
					<th class="py-2 text-right font-medium"># Accounts</th>
					<th class="py-2 text-right font-medium">Velocity</th>
					<th class="py-2 text-left font-medium">Trend</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row}
					<tr class="border-b">
						<td class="py-2">{row.styleNumber}</td>
						<td class="py-2">{row.productName}</td>
						<td class="py-2 text-right">{row.unitsOrdered}</td>
						<td class="py-2 text-right">{currency(row.revenue)}</td>
						<td class="py-2 text-right">{row.accounts}</td>
						<td class="py-2 text-right">{row.velocityScore.toFixed(1)}</td>
						<td class="py-2">
							{#if row.trend === 'up'}<span class="text-emerald-600">▲</span>{:else if row.trend === 'down'}<span class="text-destructive">▼</span>{:else}<span class="text-muted-foreground">—</span>{/if}
							{row.trend}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
```

- [ ] **Step 3: Run type check**

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 4: Manual browser verification**

- As a brand-org user, load `/reports/product-performance`.
- Verify the default 90-day window renders rows.
- Change to 30-day window; verify the URL updates and rows re-query.
- Confirm trend arrows render and sort order is by velocity desc.
- Click Export CSV; verify columns.

- [ ] **Step 5: Commit**

```bash
git add src/routes/reports/[slug]/+page.svelte
git commit -m "feat(reports): render Product Performance table with trend + window selector

Closes SCO-128"
```

---

## Task 8: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

```bash
bun run check && bun run test:run && bun run lint
```

Expected: all pass.

- [ ] **Step 2: Manual walkthrough in browser**

- Log in as a brand-org user.
- Visit `/reports` — see 2 brand templates, not the 8 rep ones.
- Visit `/reports/sales-by-rep-agency` — table renders, zero-order reps visible, CSV exports.
- Visit `/reports/product-performance` — table renders, window selector works, CSV exports.
- Try a rep-only slug (`/reports/commission`) as the brand user — expect 404.
- Log out, log back in as a rep-org user.
- Visit `/reports/sales-by-rep-agency` — expect 404.
- Visit `/reports/commission` — renders as before (regression check).

- [ ] **Step 3: Self-review diff**

```bash
git diff origin/dev...HEAD
```

Look for: leftover console logs, `any` leaks, `.eq('organization_id', ...)` on federation queries, anything that looks inconsistent with the rest of the repo.

- [ ] **Step 4: Open PR via git-pre skill**

Invoke `.claude/skills/git-pre`. Let the skill handle: final self-review, commit cleanup, push, PR open against `dev`.

PR title: `SCO-127 SCO-128 brand reports phase 1`

PR body MUST include:

```
Closes SCO-127
Closes SCO-128
Refs SCO-126
```

Leave SCO-126 open — it's the umbrella ticket and more reports come in Phase 2.

- [ ] **Step 5: Linear housekeeping**

After the PR URL is known:

- `save_issue` on SCO-127 and SCO-128 → state `In Review`.
- `create_attachment` on SCO-127 and SCO-128 with the PR URL.
- Add a comment on SCO-126: "Phase 1 (SCO-127 + SCO-128) shipped in PR <url>. Remaining Phase 2 reports: Territory Coverage, Account Penetration, Season Sell-Through, Order Pipeline."

---

## Spec coverage check

| Spec item                                                         | Task                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| Role-aware `/reports` index                                       | Task 1                                                  |
| Org-type gate in `[slug]`                                         | Task 2                                                  |
| SCO-127 data path via `org_connections` + `federated_order_links` | Task 3                                                  |
| SCO-127 zero-order reps render as rows                            | Task 3 (spine query)                                    |
| SCO-127 columns (6)                                               | Task 4                                                  |
| New `get_style_velocity_for_brand` DB fn                          | Task 5                                                  |
| SCO-128 trend = current vs prior window                           | Task 6 (`classifyTrend`, `buildProductPerformanceRows`) |
| SCO-128 columns (7)                                               | Task 7                                                  |
| `days_back` preset selector                                       | Task 7                                                  |
| Federation correctness (no `organization_id` filter on orders)    | Tasks 3, 5, 6                                           |
| Unit tests for pure helpers                                       | Tasks 3, 6                                              |
| CSV export                                                        | Tasks 4, 7                                              |
| Empty states (icon-circle pattern)                                | Tasks 4, 7                                              |
| `text-sm` minimum, no `text-xs`                                   | Tasks 4, 7                                              |
| `bun run check` / `bun run test:run` before ship                  | Task 8                                                  |
| Manual browser verification                                       | Tasks 4, 7, 8                                           |
| Close SCO-127/128 via `Closes` in PR                              | Task 8                                                  |
| SCO-126 stays open (umbrella)                                     | Task 8                                                  |
