# ADR-0001: One Federation Model Per Direction

**Status:** Accepted
**Date:** 2026-04-17
**Author:** Scott Carlton
**Context:** `docs/plans/rbac-federation-fix.md` §7

## Context

Threadline connects two organization archetypes — BOA (Brand Org Admin) and MBISR (Multi-Brand Independent Sales Rep) — through `org_connections`. Data visibility across this boundary is asymmetric: reps need broad catalog access to sell, while brands need targeted visibility into orders and accounts that affect their products.

Previous work (SCO-119) blurred this boundary by removing `organization_id` filters from own-org list views, treating all federation as implicit. This caused data leakage where own-org pages (brands, accounts, orders, expenses, appointments, contacts) showed rows from connected orgs that should only appear in dedicated federation views.

The codebase needs a single, locked-in answer for how each federation direction works, so no future change has to re-decide.

## Decision

### MBISR → BOA direction: Implicit federation

**Mechanism:** `get_connected_org_ids()` RLS helper.

When a rep org member views a connected brand org's catalog data, RLS policies grant SELECT access to rows where `organization_id IN (SELECT get_connected_org_ids())`.

**Rationale:** BOAs want their catalog (brands, products, brand assets) visible to every connected rep without manual per-order curation. A rep needs to browse the full catalog to write orders. Implicit visibility is the natural model — the act of establishing an `org_connections` row with `status = 'active'` grants read access to the BOA's catalog.

**Tables governed by this model:**

| Table                     | Policy                                            |
| ------------------------- | ------------------------------------------------- |
| `brands`                  | `organization_id IN get_connected_org_ids()`      |
| `brand_assets`            | `organization_id IN get_connected_org_ids()`      |
| `products`                | Via `org_connections.brand_org_id` join           |
| `product_variants`        | Via products join + `org_connections`             |
| `product_images`          | Via products join + `org_connections`             |
| `brand_expenses` (SELECT) | `brand_id` in connected org's brands              |
| `brand_expenses` (INSERT) | Reps may submit expenses against federated brands |

**Read-only constraint:** Reps cannot INSERT, UPDATE, or DELETE brands, brand_assets, products, or product_variants/images in the BOA. They can only read.

### BOA → MBISR direction: Explicit federation

**Mechanism:** `federated_order_links` and `federated_account_links` tables.

When a brand org member views rep data, only rows with an explicit link row are visible. Links are created automatically by the `auto_federate_order()` trigger when a rep creates an order against a connected brand.

**Rationale:** BOAs only need visibility into orders and accounts that actually affect their brand — not every rep's full book. Explicit links ensure brand visibility is opt-in by the act of creating an order, not blanket access to all rep data.

**Tables governed by this model:**

| Table                                             | Policy                                                        |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `orders`                                          | `id IN federated_order_links` (where `target_org_id` = BOA)   |
| `order_items` / `order_comments` / `order_audits` | Via `federated_order_links` join                              |
| `accounts`                                        | `id IN federated_account_links` (where `target_org_id` = BOA) |

**Write permissions:** BOAs can UPDATE order status on federated orders and INSERT comments on federated orders. They cannot create orders in the rep org or modify rep accounts.

### Sales role: Different scoping rules per org type

The `sales` role exists inside both org archetypes with different brand-scoping behavior:

**BLSR (Brand-Level Sales Rep — `sales` in a BOA):**

- Always scoped via `member_brand_access`
- Scope references own-org brands only — cannot cross the BOA boundary
- If no `member_brand_access` rows exist, sees an empty set (defensive; admin should assign brands)
- Uses `get_user_brand_ids(org_id)` for Layer 4 filtering

**MBISR Sales (`sales` in an MBISR):**

- Optionally scoped, following the Member-like rule
- Unscoped (no `member_brand_access` rows): full MBISR access — own-org brands AND federated brands from active connections, same visibility as an MBISR Admin
- Scoped (`member_brand_access` rows exist): limited to assigned brands; assignments MAY reference federated brand IDs from connected BOAs
- Uses `get_user_accessible_brand_ids(org_id)` for Layer 4 filtering

### Layer 4 helper split

Two distinct helpers serve different purposes:

- **`get_user_brand_ids(org_id)`** — own-org-only. Returns brands where `organization_id = org_id`, filtered by `member_brand_access` if the user has scope rows. Safe for BLSR. Used in RLS policies that intentionally restrict to own-org scope.

- **`get_user_accessible_brand_ids(org_id)`** (new, per §A.2a of the permissions map) — unions own-org and federated brands. Returns:
  - For Admin/Owner/unscoped Member/unscoped MBISR Sales: all brands where `organization_id = org_id` UNION all brands where `organization_id IN get_connected_org_ids()`
  - For scoped Member/Sales: the `brand_id` values from their `member_brand_access` rows (which may include federated brand IDs)
  - For BLSR with no scope rows: empty set
  - Default Layer 4 helper for MBISR page servers

## Consequences

### Migration cleanup (Task C §C.4)

The `20260417000001_federation_rls.sql` migration intentionally omits four policies that would have blurred the explicit-link model:

- "Accounts visible via federation" — BOA sees MBISR accounts via `federated_account_links` only
- "Account locations visible via federation" — follows accounts
- "Account tags visible via federation" — follows accounts
- "Tag assignments visible via federation" — follows accounts

These belong to the explicit-link model and are handled by `20260411000002_federation_infrastructure.sql`.

### `member_brand_access` schema

- `member_brand_access.brand_id` must permit federated brand IDs (brand owned by a connected BOA, not the member's own org). No foreign-key constraint should reject this.
- RLS on `member_brand_access` restricts writes to Admin/Owner of the **member's** org (not the brand's owning org).
- When a connection suspends or disconnects, `member_brand_access` rows pointing to the federated brand remain in place but yield zero visibility — `get_user_accessible_brand_ids` returns empty for that brand because `get_connected_org_ids()` excludes suspended connections. On reconnect, scope re-activates without re-assignment.

### Future federation tables

Any future table that participates in cross-org visibility must declare its federation direction and model in `docs/brd/permissions-implementation-map.md` §A.3 before the migration is merged. Use this ADR as the decision record for which direction to choose.

### BRD update

`docs/brd/roles-permissions.md` §3.4 has been updated (Task A) to reflect the BLSR vs MBISR Sales distinction described above.

## Alternatives considered

### Single implicit model for both directions

Using `get_connected_org_ids()` for everything — including BOA→MBISR visibility of orders and accounts. Rejected because it gives BOAs blanket access to all rep data, violating the principle that brand visibility should be proportional to commercial activity (orders placed against their brands).

### Single explicit model for both directions

Requiring explicit link rows for MBISR→BOA catalog access. Rejected because it adds friction to the rep workflow — reps would need to manually "subscribe" to brands before browsing their catalog, when the connection itself already implies catalog access.

### Unified helper for all scoping

A single `get_user_brand_ids` that handles both own-org and federated brands. Rejected because BLSR must never cross the BOA boundary, and a unified helper would need org-type checks at every call site. Two distinct helpers make the contract explicit and prevent accidental scope widening.
