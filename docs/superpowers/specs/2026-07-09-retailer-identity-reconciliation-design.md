# Retailer identity & drift reconciliation — design (phase 2)

**Date:** 2026-07-09
**Status:** Design. Not scheduled, not scoped for implementation. Substrate decision OPEN (see §7).
**Builds on:** `2026-07-09-retailer-signup-design.md` (v1: retailers self-sign-up, get an identity, land on the buyer portal).

## 1. Where this sits

v1 gives a retailer a self-owned identity and a portal. It has no user-visible payoff on its own — no brand can find them, and a brand's existing `accounts` rows don't point at anything. **This phase makes the identity useful to brands:** it connects a brand's private account record to the retailer's canonical identity and keeps them honest against each other without either side losing control of its data.

## 2. Problem

The same real-world retailer exists in the system as many unrelated rows: one `accounts` row per brand or rep who ever added them, plus (optionally) one canonical retailer identity if they self-signed-up. Today those never reconcile. A retailer that moves, rebrands, or changes buyers has to be corrected by hand in every brand's book, or silently goes stale everywhere.

The naive fixes both fail:

- **Pure read-through** (identity always renders the retailer's live value): kills brand autonomy. A brand legitimately keeps its own ship-to contact, a corrected phone, a "we always reach them here" — read-through erases all of it.
- **Copy + sync** (propagate retailer edits into every brand's copy): silent overwrites, conflict resolution, permanent drift on any failed write.

## 3. Model: reference identity + local override + drift stewardship

Master-data pattern. The retailer identity is the **golden record**. Each brand keeps its **own copy** (the `accounts` row it already has). The system continuously validates the copy against the golden record and surfaces divergence for the brand to resolve. Drift is not a bug to prevent — it is a **surfaced, user-resolved state**.

Core rules:

- **Pin on edit.** A field the brand has never touched silently tracks the retailer's live value — effectively read-through, always current, zero notifications. The moment the brand edits a field, that field is **pinned** to the brand's value.
- **Warn on divergence.** A pinned field warns _only_ when the retailer later changes _that_ field to something different from the brand's pinned value. Only the brand that pinned it sees the warning. Only on the field that diverged.
- **Authoritative until resolved.** The brand's pinned value stays live everywhere (CRM, orders, exports) until the brand acts. The warning is the mechanism to opt into the change; nothing shifts under the brand silently. (This is why the value on an order can differ from the retailer's current record — hence the order-level warning in §5.)
- **One-directional.** Retailer publishes; brands subscribe-with-override. The retailer never sees that a brand pinned a different value, never sees the warnings, and is never forced to adopt a brand's value. Their record is theirs.

## 4. Which fields participate

Only the **shared-identity** fields can drift — the retailer-owned columns from the v1 ownership table:

| Participates in drift (retailer-owned identity) | Never drifts (brand-private)      |
| ----------------------------------------------- | --------------------------------- |
| business name, website                          | notes                             |
| address, phone                                  | territory                         |
| buyer contacts                                  | payment terms, payment preference |
|                                                 | commission rate, order minimum    |
|                                                 | tags, archived state              |

The brand-private fields never drift because the retailer never had them — there is nothing to validate against. This is the same split the v1 spec drew; the reconciliation model rides on top of it unchanged.

## 5. Reconciliation UX — the system detects, the user decides

The guiding principle: **meet the user where they are, and give them control over breadth.** We do not choose wholesale-vs-field or account-vs-order _for_ them.

**Two surfaces (point-of-use):**

- **Account page.** A field shows a drift indicator; an info pane lists what differs from the retailer's current record.
- **The order.** An order carries the brand's data, which may not be the retailer's — so the order itself flags "this information differs from what the retailer has," with the same reconcile affordance inline. A brand correcting an order (e.g. shipping to a stale address) reconciles right there without leaving the flow.

**Two breadths (user's choice at the moment):**

- **Update (wholesale):** adopt the retailer's current values for all drifted fields; clear the pins.
- **Pick and choose (per-field):** for each drifted field, take-theirs or keep-mine. Keep-mine re-pins at the current value and goes quiet until the _next_ divergence.

**Default reach, with an escape hatch:** a reconcile targets the **account record** (the source of truth), so it settles once and stops nagging on every subsequent order — the order is just another window onto the same account-level decision. For a genuine one-off (a drop-ship or event address that should not change the standing record), an explicit **"this order only"** option applies the change to the order snapshot and leaves the account as-is. Note: a deliberate per-order alternate ship-to is a _pre-existing per-order override concept_, not drift — the two should not be conflated in the UI.

## 6. Prerequisite: the link

Drift detection only works once a brand's `accounts` row is **connected** to a retailer identity. A brand-created account for a retailer not yet on Threadline has nothing to validate against — it stays a standalone record (exactly as today) until linked. Establishing that link is the **discovery / match / claim** problem deferred from v1 (brand-initiated: "this looks like Anderson & Co on Threadline — link?", brand confirms, `accounts.retailer_id` is set). This spec assumes that link exists; the discovery mechanism is its own design.

## 7. OPEN DECISION — identity substrate

Everything above is **agnostic to where the canonical retailer identity lives.** It behaves identically whether the identity is:

- **A — a bespoke `retailers` table** (what v1 shipped). Retailer users are buyers (`retailer_users`, roles `buyer`/`buyer_admin`). No third org type; no third federation direction. The reconciliation model layers on cleanly. Ceiling: the retailer is not a first-class org — richer member/role management, and brand↔retailer / rep↔retailer as symmetric org-to-org connections, would eventually strain a bespoke table.
- **B — `organizations` with `org_type='retailer'`.** The retailer becomes a first-class org; its buyers become `organization_members` (buyer_admin → org admin); brands and reps connect to it as a third federation node. Matches the mature JOOR/NuORDER model and the user's stated north star ("retailers almost feel like they should be orgs"). Cost: a **platform re-architecture of already-shipped code** — the entire buyer portal (`/shop`, `/dashboard`, `account_users`, `account_brand_access`, buyer RLS) is built on `account_users`, not org membership, and would be rebuilt; a third `org_type` flows through every `.eq('organization_id', …)` and every RLS policy; and brand-created accounts for not-yet-joined retailers become **unclaimed shell orgs** awaiting a claim.

The reconciliation model does not force this choice, which is why it is captured separately and left open. v1's `retailers` table is a **forward-compatible stepping stone** either way — it is the identity half of a retailer org, and `retailer_users` with roles is the member model in miniature. Choosing B later is a migration of that table into `organizations`, not a teardown of this design.

**This decision is the user's to make, on roadmap timing, and is explicitly not resolved here.**

## 8. Out of scope for this spec

- The discovery/match/claim mechanism that creates the account↔retailer link (§6) — its own design.
- The substrate decision (§7).
- Any change to v1 signup.
- Retailer-side visibility into brands (the retailer never sees drift or per-brand data by design).
