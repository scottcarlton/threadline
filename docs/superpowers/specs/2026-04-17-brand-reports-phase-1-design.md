# Brand Reports — Phase 1 Design

**Linear:** SCO-126 (umbrella), SCO-127 (Sales by Rep Agency), SCO-128 (Product Performance)
**Milestone:** M3 — Buyer Experience & Federation
**Target:** Early Release, 2026-04-30
**Branch:** `sco-126-brand-reports`

## Goal

Ship the first two brand-side report templates on the existing `/reports` infrastructure. Brand orgs see reports that aggregate across their connected rep orgs via the `federated_order_links` path. Reps continue to see the existing 8 rep-centric templates.

## Scope (this PR)

- SCO-127 — Sales by Rep Agency
- SCO-128 — Product Performance / Style Velocity
- Role-aware index + detail routes under existing `/reports`

## Out of scope (follow-ups)

- Extracting shared `ReportTable` / `ReportFilters` primitives (SCO-126 Phase 2).
- The other 4 brand report templates listed in SCO-126 (Territory Coverage, Account Penetration, Season Sell-Through, Order Pipeline).
- Season, territory, and category filters on 127/128. Year is kept (existing `?year=` pattern); `days_back` presets added for 128.

## Architecture

Keep the current single-entry route; branch by org type.

```
src/routes/reports/
  +page.svelte             ← index list; branches on locals.organization.type
  +page.server.ts          ← (unchanged or minimal — index only needs title)
  [slug]/+page.svelte      ← adds render blocks for the 2 new slugs
  [slug]/+page.server.ts   ← adds 2 new case branches + org-type gate
```

- Rep-org user hitting a brand slug → 404. Brand-org user hitting a rep slug → 404. The switch uses an allow-list per org type.
- No shared component extraction. Each new report follows the existing bespoke-table pattern.

### Org-type discrimination

The plan's first implementation step verifies how brand vs rep orgs are identified today (likely a column on `organizations`). The gate derives from `locals.organization.type`; if that shape doesn't exist yet, the plan adds it or uses the verified equivalent. No guessing — verified before SQL is written.

### Federation direction

Both reports are brand→rep federation views. They MUST NOT filter by `.eq('organization_id', currentOrgId)`. They rely on RLS + `federated_order_links` gating, consistent with the rule in `CLAUDE.md` → "Do not collapse federation boundaries" and `docs/brd/permissions-implementation-map.md` §A.4.

The `rbac-change` skill runs before writing any SQL or RLS changes.

## SCO-127 — Sales by Rep Agency

**Slug:** `sales-by-rep-agency`

**Data path:**

1. Start from `org_connections` where `brand_org_id = currentOrgId` AND `status = 'active'`. This is the row spine — every active rep connection appears.
2. For each connection, aggregate orders visible via `federated_order_links` where `target_org_id = currentOrgId` AND `source_org_id = connection.rep_org_id` AND `status = 'active'`, joined to `orders` scoped to `order_year = :year` AND `status != 'cancelled'`.
3. Zero-order reps render with 0 / $0 / Status = `inactive` (last order date null). The point of the report is to surface coverage gaps.

**Columns:**

| Column          | Source                                                       |
| --------------- | ------------------------------------------------------------ |
| Rep Org Name    | `organizations.name` joined via `org_connections.rep_org_id` |
| Orders          | `COUNT(DISTINCT order.id)` within year                       |
| Revenue         | `SUM(orders.total_amount)`                                   |
| Avg Order Value | `Revenue / Orders` (guard divide-by-zero)                    |
| Last Order Date | `MAX(orders.created_at)`                                     |
| Status          | `active` if any order within year, else `inactive`           |

**Filters (Phase 1):** `?year=` only (matches existing convention). Season + territory deferred — called out explicitly in the PR.

**Implementation note:** In-memory aggregation in the server load, same pattern as the 8 existing rep reports. Single `select` with the `federated_order_links!inner(order_id)` join, plus a second query for the connection spine so zero-order reps still appear.

## SCO-128 — Product Performance / Style Velocity

**Slug:** `product-performance`

**New DB function:** `get_style_velocity_for_brand(brand_org_id UUID, days_back INTEGER DEFAULT 90, min_accounts INTEGER DEFAULT 2) RETURNS JSON`

- Mirrors `get_style_velocity` shape, but scopes orders via `federated_order_links` (`target_org_id = brand_org_id`, `status = 'active'`) AND `orders.brand_id = brand_org_id`. The rep-side function stays untouched.
- Why a new function instead of parameterizing the existing one: the rep-side function is in use; adding an optional branch path changes call-site behavior and complicates future optimization. A sibling function is cheaper and clearer.
- `SECURITY DEFINER` with `SET search_path = public`, same as the existing function. It must respect the federation contract — verified in the `rbac-change` preflight.
- Migration file: next timestamp in `supabase/migrations/`. Applied to local dev Supabase (`127.0.0.1:54322`), not remote.

**Columns:**

| Column         | Source (from JSON row)                                                                        |
| -------------- | --------------------------------------------------------------------------------------------- |
| Style #        | `style_number`                                                                                |
| Product Name   | `product_name`                                                                                |
| Units Ordered  | `total_qty`                                                                                   |
| Revenue        | `total_revenue`                                                                               |
| # Accounts     | `account_count`                                                                               |
| Velocity Score | `account_count * avg_qty_per_account` (computed client-side; fast)                            |
| Trend          | up / down / flat — comparing current `days_back` window against the prior equal-length window |

**Trend computation:** Two calls to the function: one for the current window, one for the prior window (`days_back` offset by `days_back`). Compare per-style `total_qty` or `total_revenue` delta. If a style only appears in one window, treat the other window as 0.

**Filters (Phase 1):** `days_back` preset selector (14 / 30 / 90 / 180). Season + category deferred.

## Federation correctness checklist

- [ ] Neither report adds `.eq('organization_id', currentOrgId)` on the orders query.
- [ ] `org_connections` spine filter uses `brand_org_id = currentOrgId AND status = 'active'`.
- [ ] `federated_order_links` filter uses `target_org_id = currentOrgId AND status = 'active'`.
- [ ] New DB function `SECURITY DEFINER` with `SET search_path = public`.
- [ ] `rbac-change` skill run before SQL is written.

## UX notes

- Typography: `text-sm` minimum everywhere (no `text-xs`).
- Empty states: icon-circle + title + subtitle pattern (e.g., "No connected reps yet").
- Keep the existing year dropdown UX; add a `days_back` dropdown next to it on the 128 page.
- CSV export: wire the existing `downloadCSV` utility for both reports — free once the rows array is shaped.

## Testing

- Unit tests for pure helpers (trend classification, AOV guard, status classification) colocated as `*.test.ts`.
- No UI component tests for the render blocks (presentational, per CLAUDE.md).
- Manual verification: load each report as a brand-org user against local Supabase with seeded data; confirm zero-order rep reps render for 127 and the prior-window comparison works for 128.

## Verification before completion

1. `bun run check` — 0 type errors.
2. `bun run test:run` — all pass.
3. Manual browser walkthrough for both new slugs and confirmation that the index correctly branches by org type.
4. Close SCO-127 and SCO-128 via `Closes` keywords in the PR body. SCO-126 stays open (umbrella) with a comment noting Phase 1 shipped.
