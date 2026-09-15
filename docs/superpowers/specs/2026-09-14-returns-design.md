# Returns and Credit Memos

Date: 2026-09-14
Branch: `docs/returns-spec`
Linear: SCO-141 (parent epic)

## Problem

The app promises a returns policy it has no way to execute.

`20260425000005_org_returns.sql` gives every brand org a return window, a policy document, a return address, a restocking fee, and a buyer-pays-shipping flag. All seven settings are editable at `/organization/returns`. Nothing reads any of them. They are the text of a policy, not a process.

There is no returns table, no return authorization entity, and no `returned` or `credited` order status. `OrderStatus` in `src/lib/types/database.ts:11` stops at `draft / submitted / confirmed / preparing / shipped / delivered / cancelled`. `/returns` is a coming-soon page in the top nav.

So a brand can tell a buyer "you have 30 days and we charge a 10 percent restocking fee", and then has nowhere to record the return when it arrives, no way to compute the credit, and no document to hand their accountant.

Invoicing shipped on 2026-09-14 (SCO-174 through SCO-179) and closes the forward half of this loop: an order becomes a numbered, frozen, PDF'd, emailed invoice with payments recorded against it. Returns are the reverse half, and they reuse almost all of that machinery.

## Locked decisions

Settled during brainstorming. Not open for relitigation during implementation.

1. **Both sides can start a return.** A buyer requests one from the portal and the brand approves it. A brand can also create one outright, already approved.
2. **A return authorization can be order-derived or free-entry.** Derived from a delivered order by picking lines and quantities, or entered by hand with its own items when no order is on file.
3. **Returns are line-level, not a flat credit amount.** This is what makes order derivation, per-line disposition, and restock possible.
4. **Delivered only.** Not shipped-or-delivered. The return window is measured from delivery, so a shipped-not-delivered order has no window start to compute against. Refusing an in-transit shipment is a cancellation, a different flow.
5. **The brand approves, receives, and credits. Reps can only request.** Same ownership boundary that `reject_non_brand_fulfillment_status()` already enforces on orders: the brand owns fulfillment state, and a credit is fulfillment state in reverse.
6. **The credit memo is fields on the return authorization, not a second table.** One RA never needs two credit memos, and `return_lines` already are the memo lines.
7. **Milestone is Beta Release.**

## Scope

In scope:

- `return_authorizations` and `return_lines` tables with RLS.
- Buyer and rep request flow, brand approval flow.
- Order-derived and free-entry RA creation.
- RA numbering, deferred to approval.
- Receiving goods with per-line disposition and variant restock.
- Credit calculation from the existing org policy settings, with brand override.
- Credit memo: numbering, freeze, PDF, email, CSV export.
- `/returns` list, `/returns/new`, `/returns/[id]`, and order detail integration.

Out of scope:

- Refunds and payment reversal. A credit memo is a document, not a money movement. Applying credit against a future order is post-launch.
- Exchanges. A return plus a new order, not a first-class entity.
- Return shipping labels and carrier integration.
- Partial receipt across multiple inbound shipments. An RA is received once, whole.
- A `returned` or `credited` order status. The RA carries the state; the order gets a badge, not a new status value.

## Data model

### `return_authorizations`

Owned by the **issuing brand org**, exactly as `invoices` is. For a federated order that is not `orders.organization_id`, which is always the rep org. The rep sold it; the brand takes the goods back and issues the credit.

| Column                                                                                  | Notes                                                             |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `id`                                                                                    |                                                                   |
| `organization_id`                                                                       | issuing brand org                                                 |
| `order_id`                                                                              | **nullable**. NULL means free-entry.                              |
| `brand_id`, `order_org_id`, `account_id`                                                | denormalized read keys                                            |
| `ra_number`                                                                             | NULL until approved                                               |
| `status`                                                                                | `requested / approved / declined / received / closed / cancelled` |
| `reason`, `reason_code`                                                                 | header-level reason                                               |
| `requested_by`, `requested_at`                                                          |                                                                   |
| `approved_by`, `approved_at`, `decline_reason`                                          |                                                                   |
| `received_by`, `received_at`                                                            |                                                                   |
| `credit_subtotal`, `restocking_fee`, `shipping_deduction`, `credit_tax`, `credit_total` |                                                                   |
| `credit_memo_number`, `credit_memo_issued_at`, `applied_invoice_id`                     |                                                                   |
| `created_by`, `created_at`, `updated_at`                                                |                                                                   |

`brand_id`, `order_org_id`, and `account_id` are denormalized for the same reason they are on `invoices`: every SELECT policy stays a single-table predicate. Do not subquery through `orders` inside an RLS policy. A subquery inside a policy is itself subject to the referenced table's RLS, and `orders` carries the dense policy set that already produced a 42P17 once (`20260901000001_fix_orders_update_recursion.sql`).

`order_org_id` is nullable, unlike on `invoices`. For a free-entry RA raised by a rep it is the requesting rep org, which is what keeps that rep able to see their own request. For a free-entry RA raised by a brand it is NULL, and no rep sees it, which is correct because no rep is involved.

`UNIQUE (organization_id, ra_number)` and `UNIQUE (organization_id, credit_memo_number)`, both per-org rather than global. `20260909000002_fix_expense_number_sequencing.sql` had to widen exactly this constraint on `brand_expenses` after two orgs whose slugs shared their first three characters collided on a global UNIQUE.

There is deliberately no `UNIQUE` on `order_id`. One delivered order can be returned against more than once.

### `return_lines`

| Column                                         | Notes                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `return_id`                                    |                                                                                                                                 |
| `order_line_id`                                | **nullable**, NULL for free-entry lines                                                                                         |
| `variant_id`                                   | nullable, resolved at creation where possible; drives restock                                                                   |
| `style_number`, `description`, `color`, `size` | snapshot, not a view onto `order_lines`                                                                                         |
| `qty`, `unit_price`                            |                                                                                                                                 |
| `line_total`                                   | `GENERATED ALWAYS AS (qty * unit_price) STORED`. Postgres rejects any explicit value including NULL, so never send this column. |
| `reason_code`                                  | per-line reason                                                                                                                 |
| `disposition`                                  | `restock / damaged / destroy`, set at receipt                                                                                   |
| `sort_order`                                   |                                                                                                                                 |

Lines are a snapshot for the same reason `invoice_lines` are. A credit memo is a financial document. If someone edits the order afterwards, the memo the buyer already received must not change underneath them.

### Counters

`organizations.next_ra_number` and `organizations.next_credit_memo_number`, both `INTEGER NOT NULL DEFAULT 1`. Stored counters, never `COUNT(*) + 1`, per the fix in `20260909000002`. A counter only advances, so deleting a row elsewhere can never hand the next issue a value already in use.

## State machine

```
                  ┌─ declined
requested ────────┤
   │              └─ approved ──── received ──── closed
   └─ cancelled                       │
                                      └─ cancelled
```

- Buyer or rep creates an RA at `requested`.
- Brand creates an RA directly at `approved`. No self-approval step.
- `approved` assigns `ra_number` via `generate_ra_number(p_organization_id)`. Numbering is deferred to approval for the same reason invoice numbering is deferred to send: a declined or cancelled request must not burn a sequence value and gap the issued series.
- `received` applies per-line disposition and restock.
- `closed` on credit memo issue.

A `reject_issued_credit_memo_edits()` trigger freezes `credit_memo_number`, all five money columns, `order_id`, the three denormalized read keys, and the lines once `credit_memo_number IS NOT NULL`. Needs `OLD`, so it is a trigger rather than a `WITH CHECK`. Same shape and reasoning as `reject_sent_invoice_edits()` in `20260914000001`.

## Money

```
credit_subtotal    = Σ (return_lines.qty × unit_price)
restocking_fee     = policy: percent of subtotal, or flat amount
shipping_deduction = policy: return shipping when returns_buyer_pays_shipping
credit_tax         = invoice tax_amount × (credit_subtotal / invoice subtotal)
credit_total       = credit_subtotal − restocking_fee − shipping_deduction + credit_tax
```

Defaults come from `organizations.returns_restocking_fee_type` (`percent` or `flat`), `returns_restocking_fee_value`, and `returns_buyer_pays_shipping`. The brand can override each of the three before issuing, because a goodwill waiver is routine in wholesale and a policy that cannot be waived gets worked around outside the system.

Tax prorates from the source invoice when the RA is order-derived and that order has a sent invoice. It is zero on free-entry, and zero when no invoice exists, unless entered by hand. Never recompute tax from the org's current rates: the original was frozen at send precisely so a later rate change cannot restate an issued document, and the credit has to match what was charged.

> **Correction (SCO-183 implementation).** This originally said the proration reads `invoices.tax_breakdown`. That is wrong in practice. `send_invoice()` in `20260914000004` sets `subtotal`, `tax_amount`, and `total` and never writes `tax_breakdown`, so the column is still `'[]'::jsonb` on every invoice in the system and prorating from it would return zero tax on every credit ever issued. The proration reads `tax_amount` against `subtotal` instead, both of which are populated and frozen by `reject_sent_invoice_edits()`. If `tax_breakdown` is ever populated it becomes a refinement of this ratio, not a replacement for it.

The credit total branches on pricing display exactly as `send_invoice()` does: under inclusive pricing the tax already sits inside the line prices, so it is reported on the memo but not added to the total; under exclusive pricing it is added. The total is floored at zero, because deductions larger than the goods mean the brand owes nothing, not that the buyer owes the brand.

Rounding is half away from zero at the cent, decided in the module rather than left to Postgres. Binary floating point stores `2.675` as `2.67499999999999982`, so a naive `Math.round(n * 100) / 100` leaves a credit memo a cent short of the invoice it credits.

This all lives in a pure module, `src/lib/server/returns/credit.ts`, with unit tests. No database access, no Supabase client.

## Eligibility

`returns_window_days` counted from the order's delivery date.

- `0` disables returns. Buyers see no request action at all.
- Past the window, the buyer-facing action is blocked with the policy text shown.
- The brand is never blocked by its own window. Brands override their own policy routinely, and the enforcement point is the buyer request, not the record.

Also in `src/lib/server/returns/credit.ts`, also pure and tested.

## Permissions

Mirrors invoicing, minus the draft gate. A `requested` RA is the whole point of the request, so there is nobody to hide it from.

| Actor | SELECT on `return_authorizations`                                                 |
| ----- | --------------------------------------------------------------------------------- |
| Brand | `brand_id IN (SELECT get_user_brand_ids(organization_id))`                        |
| Rep   | `order_org_id IN (SELECT get_user_org_ids()) AND order_org_id <> organization_id` |
| Buyer | `account_id IN (SELECT get_buyer_account_ids())`                                  |

> **Correction (SCO-182 implementation).** The rep arm originally omitted `order_org_id <> organization_id`. That guard is load-bearing, not tidy-up, and `invoices` already carries it for the same reason: policies are OR'd, so without it the rep arm matches a brand-internal return, whose order org _is_ the issuing org, and hands every member of the brand org a row the brand-scoped arm deliberately withheld, defeating `member_brand_access`. It is the same class of bug `20260910000002_orders_update_brand_scope.sql` fixed on `orders`. Pinned by the "member scoped to one brand" case in `tests/rls/returns.test.ts`.
>
> The guard also does the right thing for a rep-raised free-entry return: the issuing org is the brand, `order_org_id` is the rep, so the arm still matches.

INSERT:

- Buyer: own account only, `status = 'requested'` only, and `brand_id IN (SELECT get_buyer_brand_ids())`. The brand clause was added during implementation: without it a buyer could write denormalized keys pointing at a brand org they have no relationship with, injecting a fabricated request into that org's queue. The exposure is integrity, not disclosure, since the keys a writer sets decide who may _read_ the row.
- Rep: own org only, `status = 'requested'` only, cross-org only.
- Brand: own brands, `status IN ('requested', 'approved')`, admin/owner/member.

UPDATE: admin, owner, or member of the issuing brand org. This is the only arm that can move status past `requested`, which is what enforces locked decision 5.

DELETE: admin or owner, `status = 'requested'` only. Once approved, an RA carries a number and can only be cancelled.

`return_lines` inherit visibility from the parent RA, and are writable only while the parent is `requested` or `approved`.

A `reject_issued_credit_memo_line_edits()` trigger backstops that for service-role writes, but it guards **INSERT and UPDATE only, never DELETE**. `return_lines.return_id` is `ON DELETE CASCADE`, and a cascade fires the child row trigger with the parent still visible to the statement's snapshot, so guarding DELETE made any return carrying an issued credit memo permanently undeletable, and with it its organization. That was found by testing the cascade against the local database during SCO-182, not by reading the code. Direct deletion of a line on an issued memo is still refused by the RLS DELETE policy; only the service-role case is given up.

Uses only existing helpers (`get_user_brand_ids`, `get_user_org_ids`, `get_buyer_account_ids`), so no new RLS helper and no ADR. Entries go in `docs/brd/permissions-implementation-map.md` §A.3 as part of the schema ticket, not as a follow-up, per `.claude/skills/rbac-change`.

## Restock

On transition to `received`, every line with `disposition = 'restock'` and a non-NULL `variant_id` increments `product_variants.stock_qty` by `qty`.

Skipped when `stock_qty IS NULL`. Per `20260422000001_variant_stock_and_shopify_links.sql`, NULL means "no signal yet" and the UI renders no pill. Writing a number into it would invent inventory tracking for an org that has not opted into it.

Free-entry lines that never resolved to a variant do not restock. There is nothing to increment.

## UX

Surfaces, all role-aware. Every list and empty state follows the canonical big-thin-icon pattern in CLAUDE.md, not the small circle variant.

### `/returns`

Replaces the coming-soon page. Status-filtered list.

- Brand: every RA across their brands. Needs-action first, since `requested` is a queue.
- Rep: RAs on orders in their org. Read-only past `requested`.
- Buyer: their own, across all their accounts.

Per the role-aware audit rule, strip the column the viewer already owns. A brand user does not need the brand name on every row.

### `/returns/new`

Two modes behind one entry point.

- **From an order.** Delivered orders only. The order picker is a modal, per the large-list picker rule: the step page shows the selected order and its lines, not a thousand-row list. Then pick lines and quantities, capped at what was ordered minus what has already been returned against that line.
- **Free entry.** Account picker, then manual lines. Style numbers autocomplete against the brand's catalog so `variant_id` resolves where possible, which is what lets these lines restock later.

### `/returns/[id]`

Lines, status timeline, and the action for the viewer's role and the RA's state. Approve or decline. Receive, setting per-line disposition. Credit breakdown with the three overridable inputs. Issue credit memo.

### `/orders/[id]`

"Request return" for buyers and reps, "Log return" for brands, on delivered orders in window. An outstanding-RA badge. A return history block once any RA exists against the order.

### Documents

`/api/returns/[id]/credit-memo/pdf` and `/api/returns/[id]/credit-memo/send`, reusing `src/lib/server/invoice-pdf.ts` and the Resend path from `20260914000004`. CSV export of issued credit memos for accounting reconciliation, which SCO-141 called for and is the reason an accountant will accept this at all.

Every one of these endpoints needs a server-derived ownership check. `supabaseAdmin` bypasses RLS, and `/api/orders/[id]/pdf` already shipped an IDOR once (SCO-165).

## Testing

Unit tests, colocated:

- `src/lib/server/returns/credit.test.ts`: percent and flat restocking fee, shipping deduction on and off, tax proration, overrides, zero-window disable, in and out of window, delivery date missing.
- Line quantity capping against prior returns on the same order line.

RLS tests in `tests/rls/`, run with `bun run test:rls`:

- Brand member with access to one brand cannot see another brand's RAs.
- Rep sees an RA on an order in their org, including `requested`.
- Rep cannot approve, receive, or issue a credit memo.
- Buyer for account A cannot see an RA for account B.
- Buyer cannot create an RA at any status other than `requested`.
- Revoking a connection removes rep visibility.
- An issued credit memo rejects edits to frozen columns.
- A `requested` RA is deletable by admin or owner; an approved one is not.

`bun run check` at 0 errors and `bun run test:run` green on every ticket.

## Ticket split

Seven tickets, one PR each per the one-PR-per-deliverable rule. SCO-141 becomes the parent epic.

1. **SCO-182 Schema, RLS, permissions map.** Both tables, both counters, both triggers, §A.3 entries. No UI, nothing that writes to them.
2. **SCO-183 Credit and eligibility module.** `src/lib/server/returns/credit.ts`, pure and fully unit-tested. No UI.
3. **SCO-184 Create a return authorization.** `/returns/new` in both modes, plus the order detail entry points.
4. **SCO-185 List and detail.** `/returns` and `/returns/[id]`, role-aware, read-only.
5. **SCO-186 Approve, decline, receive.** RA numbering, per-line disposition, variant restock.
6. **SCO-187 Credit memo.** Calculation freeze, numbering, PDF, email, CSV export.
7. **SCO-188 Order detail integration.** Outstanding badge, return history block, invoice linkage.

Tickets 1 and 2 are independent and can run in parallel. 3 through 7 are sequential on 1.
