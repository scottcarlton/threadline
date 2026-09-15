# SP1 — Retailer org identity + portal landing — design

**Date:** 2026-07-10
**Status:** Design, pending user approval → writing-plans.
**Part of:** the retailer-as-org re-architecture (SP1 of SP1→SP4). Supersedes the v1 `retailers`/`retailer_users` table approach.
**Supersedes:** `2026-07-09-retailer-signup-design.md` (v1). Keeps its onboarding card, hook-routing shell, IDOR fix, and the phase-2 reconciliation spec.

## Goal (this slice)

A retailer signs up, becomes a first-class `organizations` row (`org_type='retailer'`), its founder is an `organization_members` admin, and they land on the buyer portal (`/dashboard`) — empty until federation (SP3) grants shopping access. Same visible outcome as v1, but the retailer is now a real org, not a bespoke table.

**Explicitly not in SP1:** shopping access / brand↔retailer federation (SP3), account unification + migrating legacy `account_users` buyers (SP4), reconciliation (phase 2). Legacy `account_users` buyers keep working untouched.

## Why the v1 tables go away

v1 shipped `retailers` + `retailer_users` as standalone tables specifically to avoid a third `org_type`. The decision has reversed: retailers become orgs. Since v1 is **unmerged and applied only to local dev**, there is no production data to migrate — we rework the v1 migration into the org-model version and re-apply locally. No data migration, no dual model.

## Key decisions (defaults I chose — veto any)

1. **`org_type` widens to `('rep','brand','retailer')`.** CHECK constraint + `OrgType` TS union both gain `'retailer'`.
2. **Retailer founder is `organization_members.role='admin'`** — reuse the existing `user_role` enum (admin/owner/member/sales/guest). No new role type. A retailer's "buyer_admin" concept maps to `admin`; additional retailer staff invited later map to `member`.
3. **`create-retailer` endpoint stays, but creates an org.** It keeps its current URL (the onboarding card already POSTs there) and its `{ retailerName, displayName }` body, but internally does what `create-org` does — insert `organizations` (org_type='retailer') + `organization_members` (admin) — and **skips** the brand-only seeding (self-brand trigger, seasons, shipping methods). Rationale: keeps retailer creation isolated and idempotent, avoids threading a third branch through `create-org`'s brand logic.
4. **The buyer portal is reached by `org_type`, not by absence-of-membership.** This is the core change and the heart of the member-XOR-buyer collision. See Architecture.
5. **`accounts.retailer_id` (v1 seam) becomes `accounts.retailer_org_id → organizations(id)`.** Still written by nothing in SP1 — it's the SP4 seam, now pointing at an org. Keeps the column forward-correct.
6. **`isBuyer` stays the portal gate.** A retailer-org member gets `isBuyer=true` with empty buyer context (no accounts, no brand access yet), so the entire existing `/dashboard` + `/shop` empty-state code works unchanged. We do **not** add a parallel `isRetailer` portal — that would fork every buyer-portal guard.

## Architecture

### The member-XOR-buyer collision, resolved

Today `hooks.server.ts` is `if (allMemberships.length) { org path → /insight } else { buyer path → /dashboard }`. A retailer-org member has a membership, so they'd wrongly hit the org path.

Change: **inside the membership branch, fork on the active org's type.**

- Active org is `rep` or `brand` → unchanged (existing insight/brand-scope path).
- Active org is `retailer` → set `isBuyer=true`, resolve buyer context (empty in SP1: no `account_users`, no connections yet), do **not** run rep/brand brand-scope setup, do **not** route to `/insight`. They land on `/dashboard`.

`resolveBuyerContext` gains a retailer-org branch: given a retailer-org membership, it returns `isBuyer:true` with `buyerAccounts:[]`, `buyerBrandIds:[]` (SP3 will populate brand access from connections), and the retailer org as `organization`. Legacy `account_users` buyers (no membership) keep flowing through the existing `else` branch unchanged — both paths converge on `isBuyer=true`.

Reciprocal guards (`/insight` bounces buyers to `/dashboard`, `/dashboard` bounces non-buyers to `/insight`, etc.) keep working because they key on `isBuyer`, which is now true for retailer-org members.

### Post-login + onboarding routing

- `auth/callback`: after the membership check, if the user's membership is a retailer org → `/dashboard` (alongside the existing `account_users`/`retailer_users`→`/dashboard`). Actually simpler: retailer-org members ARE memberships, so the existing "has membership → /insight" needs the same org_type fork. Callback resolves org_type of the membership and routes retailer → `/dashboard`, rep/brand → `/insight`.
- `onboarding/+page.server.ts`: bounce a completed retailer to `/dashboard` (keyed on the retailer org's `onboarding_completed_at`, which now lives on `organizations` like every other org — the v1 `stores.onboarding_*` columns are gone).
- Onboarding wizard: the "Retailer" card and `saveRetailerType()` stay; `saveRetailerType` now hits the reworked `create-retailer` and, on success, sets the **org's** `onboarding_completed_at` and navigates to `/dashboard`.

## Schema changes (one reworked migration)

Rework `supabase/migrations/20260709000001_retailer_signup.sql` into the org version:

- **Drop** `CREATE TABLE retailers` and `retailer_users`, their RLS, `get_user_retailer_ids()`, `is_retailer_admin()`.
- **Widen** `organizations.org_type` CHECK to include `'retailer'`.
- **Rework** `accounts.retailer_id` → `accounts.retailer_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL` (still unused in SP1).
- Retailer orgs get **no** self-brand: verify `auto_create_self_brand` only fires on `org_type='brand'` (it does — `IF NEW.org_type='brand'`), so a retailer org is correctly skipped. No change needed there, but the SP1 tests assert a retailer org creates zero brands.

Local re-apply: drop the v1 objects, un-record the migration, re-apply, reload PostgREST. (Same procedure as the v1 rename.)

## Files

**Rework:**

- `supabase/migrations/20260709000001_retailer_signup.sql` → org-model version (above).
- `src/lib/server/retailers.ts` — `createRetailer()` now inserts `organizations` + `organization_members` (admin), idempotent on existing retailer-org membership. Drops the `retailer_users` logic.
- `src/lib/server/buyer-context.ts` — add the retailer-org-membership branch; `store`/`retailer` field now resolves from the org, not `retailer_users`.
- `src/hooks.server.ts` — fork the membership branch on `org_type`.
- `src/routes/auth/callback/+server.ts` — route retailer-org membership → `/dashboard`.
- `src/routes/onboarding/+page.server.ts` + `+page.svelte` — retailer completion sets org `onboarding_completed_at`, lands `/dashboard`.
- `src/lib/types/database.ts`, `src/app.d.ts` — `OrgType += 'retailer'`; drop `Retailer`/`RetailerUser` interfaces (they were `retailer_users`-shaped). **`locals.retailer` is removed** — a retailer-org member's org _is_ their retailer org, so it lives in `locals.organization` (with `orgType='retailer'`). One identity, no parallel field.

**Delete:** `src/routes/api/onboarding/create-retailer/+server.ts` stays (reworked), but the v1 `retailers`-table types go.

## Testing

- **Unit** — `createRetailer()`: creates org + admin membership, idempotent, trims name, no self-brand seeded. Hook fork: retailer-org member → `isBuyer=true`, empty context, org set; rep/brand member → unchanged (regression); legacy `account_users` buyer → unchanged (regression).
- **Integration (real local DB, real RLS, real JWT)** — the v1 harness, updated: sign up → retailer org exists, founder is admin member, lands `isBuyer=true` on empty portal; a rep/brand member is unaffected; RLS: a retailer-org member reads only their own org.
- **Manual** — sign up as retailer, land on `/dashboard` empty; sign in again → `/dashboard` (no loop); a rep and a brand still reach `/insight`.

## Open question for SP2/SP3 (not SP1, flagged so it isn't lost)

A retailer org today has no shopping access because `account_brand_access` is per-`account`, and a retailer org has no account. SP3 replaces that with connection-derived brand access (brand↔retailer edges). SP1 deliberately ships the empty portal; do not wire shopping here.
