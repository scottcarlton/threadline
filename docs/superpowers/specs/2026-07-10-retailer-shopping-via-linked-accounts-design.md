# SP3 — Retailer shopping via linked accounts — design

**Date:** 2026-07-10
**Status:** Approved, → writing-plans / implementation.
**Part of:** the retailer-as-org re-architecture (SP3 of SP1→SP4). Builds on SP1 (`2026-07-10-retailer-org-identity-design.md`).

## Goal (this slice)

A retailer-org member can shop and order from exactly the brands that have (a) linked one of their `accounts` rows to the retailer's org via `accounts.retailer_org_id`, **and** (b) granted that account brand access via `account_brand_access`. No more, no less. Legacy `account_users` buyers are untouched; no cross-tenant leak.

**Explicitly not in SP3:** the brand→retailer discovery / match / claim mechanism that _sets_ `accounts.retailer_org_id` (SP4 + its own discovery design), account unification, and reconciliation (phase 2). SP3 assumes the link exists and makes shopping work through it.

## The crux: extend one function at its single source of truth

Every buyer-facing RLS policy in the schema resolves access through **`get_buyer_account_ids()`** — directly (`accounts`, `orders`, `order_lines`) or via `get_buyer_brand_ids()` (`brands`, `products`, `product_variants`, `product_images`, `seasons`). `get_buyer_brand_ids()` is defined as:

```sql
SELECT DISTINCT brand_id FROM account_brand_access
WHERE account_id IN (SELECT get_buyer_account_ids());
```

So the entire retailer-shopping surface opens by extending `get_buyer_account_ids()` alone. **Zero new policies.**

```sql
CREATE OR REPLACE FUNCTION get_buyer_account_ids()
RETURNS SETOF UUID AS $$
  SELECT account_id FROM account_users WHERE profile_id = auth.uid()
  UNION
  SELECT a.id FROM accounts a
  JOIN organizations o ON o.id = a.retailer_org_id AND o.org_type = 'retailer'
  JOIN organization_members om ON om.organization_id = o.id
  WHERE om.profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
```

## Security properties

- **Link is necessary, not sufficient.** Setting `retailer_org_id` grants nothing on its own. A retailer sees a brand only when a linked account _also_ has an `account_brand_access` row — the same explicit brand-side grant that gates every `account_users` buyer today. This keeps the brand in control of what a linked retailer can see (aligned with the reconciliation model: the account is the brand's copy).
- **No cross-tenant leak.** The retailer arm is scoped by `om.profile_id = auth.uid()` — the caller's own memberships only. The `org_type = 'retailer'` guard means a stray/mis-set FK pointing at a rep/brand org cannot widen access for that org's members.
- **Legacy buyers untouched.** The `account_users` arm is byte-for-byte the original; `UNION` only _adds_ retailer rows. An invited buyer's scope is unchanged. (`UNION`, not `UNION ALL`, so an account that is both invited-into and retailer-linked de-dupes.)
- **`SECURITY DEFINER` unchanged.** The function already runs definer-side to bypass RLS on `account_users`; the added joins on `accounts`/`organizations`/`organization_members` run under the same definer, which is required (a retailer member has no direct RLS path to those account rows yet — that path is exactly what we are granting).

## App layer (mirrors RLS, one spot)

`hooks.server.ts`'s retailer branch currently hardcodes `buyerAccounts = []` / `buyerBrandIds = []` (SP1 placeholder). SP3 replaces those two lines with a resolver.

- **New:** `resolveRetailerBuyerContext(admin, retailerOrgId, userId)` in `src/lib/server/buyer-context.ts`. Reads `accounts WHERE retailer_org_id = retailerOrgId` (admin, since the retailer member's normal client now _can_ read them via the extended helper, but the hook already holds `admin` and the org id is server-derived), then their `account_brand_access` → `buyerBrandIds`. Returns `{ buyerAccounts, buyerBrandIds }`.
- `resolveBuyerContext` (the `account_users` path) is **unchanged**.
- The retailer member can legitimately have **multiple** linked accounts — one per brand-org that added and linked them. This is the existing "one buyer business, many brand-scoped `accounts` rows" shape the portal already merges across (see `project_buyer_account_model`). Retailers ride that existing multi-account plumbing; SP3 adds no new portal grouping logic.

### `buyerAccounts` shape for retailers

`BuyerAccountRow = AccountUser & { account_id, accounts? }`. A retailer member has **no `account_users` row**, so the resolver synthesizes rows carrying `account_id` and the embedded `accounts` (with `organization_id`) that downstream consumers read. Only fields actually consumed downstream are populated; `account_users`-specific fields (`role`, `invited_by`, `accepted_at`) are not meaningful for a retailer and are left absent/synthetic. The implementation plan pins the exact consumed fields by grepping `locals.buyerAccounts` usages before finalizing the synthetic shape.

## `is_buyer_user()`

Currently used by **no** RLS policy (verified by grep). Not extended in SP3 — extending an unused helper would be speculative (YAGNI). If a future policy adopts it for retailers, extend it then, with a test.

## Files

**Migration (new):** `supabase/migrations/2026071000000X_retailer_buyer_account_ids.sql` — the `CREATE OR REPLACE FUNCTION get_buyer_account_ids()` above. Local re-apply + PostgREST reload.

**Modify:**

- `src/lib/server/buyer-context.ts` — add `resolveRetailerBuyerContext`; export its return type.
- `src/hooks.server.ts` — retailer branch calls the resolver instead of hardcoding empties.

## Testing

- **Unit** (`buyer-context.test.ts`): `resolveRetailerBuyerContext` — linked account with brand access → correct brand ids; linked account with _no_ `account_brand_access` → empty brand ids (link-not-sufficient); multiple linked accounts across brand-orgs → union of brand ids; no linked accounts → empty. Hook fork regression: legacy `account_users` buyer path unchanged.
- **Integration** (real local DB, real JWT, real RLS — extend `verify-retailer-org.ts` or a new harness): seed a brand org + brand + product + an `accounts` row with `retailer_org_id` set + an `account_brand_access` grant; assert the retailer member's **RLS-constrained** client reads exactly that brand's product and not others; a second retailer cannot see the first's linked account/brand; a legacy `account_users` buyer is unaffected; a linked-but-ungranted account yields no brand/product visibility.
- **Gates:** `bun run check` 0 errors, `bun run test:run` green, existing `federation.test.ts` (if present) green.

## Open (deferred, flagged so it isn't lost)

- **Order placement account selection.** When a retailer has multiple linked accounts and starts an order for brand X, the order must hang off the account linked to X's org (`orders.account_id` NOT NULL, and the buyer INSERT policy requires `account_id IN get_buyer_account_ids() AND brand_id IN get_buyer_brand_ids()`). The existing cross-brand buyer checkout already resolves account-by-brand; SP3 relies on it. If a gap surfaces during integration testing, it is called out there, not patched silently.
- **Discovery/linking (SP4).** Setting `retailer_org_id` is out of scope; seeded directly in tests.
