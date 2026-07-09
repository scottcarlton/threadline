# Store self-signup — design

**Date:** 2026-07-09
**Branch:** `feat/store-signup`
**Status:** Approved for implementation

## Problem

Threadline supports two signup types: Brand (`org_type='brand'`) and independent sales rep (`org_type='rep'`). Stores — the retailers that buy from brands — cannot create an account.

Buyers already have real login accounts today: `account_users` (roles `buyer` / `buyer_admin`), a portal at `/dashboard`, a storefront at `/shop`, and team management at `/account/team`. But a buyer only comes into existence when a brand or rep sends a `buyer_invitations` invite.

The gap is not "buyers can't log in." It is that **no store-owned identity exists before a brand adds them**, so there is nothing for a brand to search and nothing for a store to keep current.

Compounding this: `accounts.organization_id` is `NOT NULL`, and `accounts` has no global directory, no dedupe key, and no uniqueness on `business_name` or email. Two orgs holding "the same" store hold two unrelated rows, joined only by `federated_account_links` after an order is placed.

## Goal (v1)

A store signs up unaided, gets a durable business identity, and lands on the existing buyer portal with correct empty states.

**v1 has no user-visible payoff.** A store that signs up sees empty screens; no brand can find them. Value arrives in phase 2 (discovery + linking). Identity must exist before anything can point at it, so this is the right build order — but v1 is mergeable, not shippable to users on its own.

## Approach

A store is **not** an `organizations` row.

Rejected: `org_type='store'`. It would give org name, slug, settings, and member roles for free, but a third org type would then flow through every `.eq('organization_id', currentOrgId)` filter, every RLS policy that assumes `rep|brand`, and `get_connected_org_ids()`. `hooks.server.ts` would treat store users as org members and route them to `/insight`. This is the federation-boundary collapse that `CLAUDE.md` warns against.

Rejected: nullable `accounts.organization_id`. An orphan row with `organization_id IS NULL` passes no RLS policy and is invisible to everyone including its owner. And a store adopted by two brands can only have one `organization_id`.

Chosen: **a global `stores` directory table, plus per-org `accounts` rows that link to it.** This matches the existing buyer-scoping model: one buyer user = one business identity; the business has separate `accounts` rows in each brand-org; the portal merges across them.

### Identity is read-through, not synced

When phase 2 lands, a brand's linked `accounts` row will **read** identity fields from `stores` at query time rather than holding copies. There is one row, so it cannot drift. No fanout job, no conflict resolution, no reconciliation.

Field ownership (established now, enforced in phase 2):

| Store-owned (`stores`)                                                   | Org-owned (`accounts`, private per-org)              |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `business_name`, `website`                                               | `notes`                                              |
| address, `phone`                                                         | `territory_id`                                       |
| buyer contacts (via `store_users` → `profiles`, not columns on `stores`) | `payment_terms`, `payment_preference`                |
|                                                                          | `commission_rate_override`, `order_minimum_override` |
|                                                                          | tags, `archived_at`                                  |

Two brands can both link the same store, disagree completely on terms and territory, and still both see the store's current address.

## Schema

One migration. Nothing existing is altered except one added nullable column.

```sql
CREATE TABLE stores (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name           TEXT NOT NULL,
  website                 TEXT,
  phone                   TEXT,
  address_line1           TEXT,
  address_line2           TEXT,
  city                    TEXT,
  state                   TEXT,
  zip                     TEXT,
  country                 TEXT DEFAULT 'US',
  onboarding_step         INT NOT NULL DEFAULT 1,
  onboarding_completed_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE store_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer','buyer_admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, profile_id)
);

-- The seam for phase-2 brand-initiated linking. Written by nothing in v1.
ALTER TABLE accounts ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
```

Decisions:

- **`onboarding_step` / `onboarding_completed_at` on `stores`**, mirroring `organizations` (`20260428000001_onboarding_state.sql:12-13`). The wizard's resume-on-refresh behavior needs somewhere to persist and a store has no org row.
- **`role` mirrors `account_users`'s `('buyer','buyer_admin')`** so phase-2 linking carries roles across with no mapping table.
- **`accounts.store_id` ships now, unused.** One line today; a second migration against the busiest table in the schema if deferred.
- **No `slug`.** `create-org` slugifies and 409s on collision. Stores need no public URL in v1, and two real stores can legitimately share a name — uniqueness here would reject valid signups.

### RLS — deliberately closed

In v1 **no brand or rep can read `stores` at all.**

```sql
CREATE FUNCTION get_user_store_ids() RETURNS SETOF UUID ...
  SELECT store_id FROM store_users WHERE profile_id = auth.uid();
```

- `stores`: a store user selects and updates their own store. Nobody else.
- `store_users`: a store user selects rows for their store; `buyer_admin` manages them.

The cross-org readable directory — the first table in the system scoped by neither org nor connection — is a real new read surface. Phase 2 opens it deliberately, with its own review and its own public/private column split. It does not arrive as a side effect of signup.

## Signup & onboarding flow

No new signup entry point. `/login` already creates users for anyone (`shouldCreateUser: true`). The fork is at the existing **step 3**.

Steps 1 and 2 already collect exactly what a store needs — display name (step 1) and business name (step 2). The store path is steps 1 → 2 → 3, then done. No new wizard step.

**Step 3 gains a third card.** `src/routes/onboarding/+page.svelte:702-805` renders two cards writing `orgType = 'rep' | 'brand'`. This becomes `accountType = 'rep' | 'brand' | 'store'`. Selecting Store calls a new `POST /api/onboarding/create-store` instead of `create-org`.

Card copy is user-facing and will be drafted against `docs/brand/guidelines.md` §1.5 at implementation time. The existing cards are one-line role statements ("I represent multiple brands and manage accounts, orders, and commissions"); the store card matches that shape.

**`POST /api/onboarding/create-store`** mirrors `create-org`'s structure, using `supabaseAdmin` (per the `@supabase/ssr` JWT-drop-on-writes constraint) with an app-layer auth check:

1. Auth guard; 401 without a session.
2. **Idempotency:** if the user already has a `store_users` row, return that store. Mirrors the `organization_members` check at `create-org:21-31`; protects against refresh and resubmit.
3. `UPDATE profiles SET display_name`.
4. `INSERT stores { business_name }`.
5. `INSERT store_users { store_id, profile_id, role: 'buyer_admin' }` — first user is admin, matching `buyer-invite/send:69-78`.

`finish()` sets `stores.onboarding_completed_at` and redirects to `/dashboard`.

Not done for stores: self-brand, seasons, shipping methods (all brand-org concerns, `create-org:88-117`). The step-6 welcome carousel is skipped — its copy is rep/brand specific.

## Routing & session

Three files. This is where the current system actually breaks.

### `src/hooks.server.ts` — buyer resolution (the `else` at line 214)

`isBuyer` derives only from `account_users` (line 215-218). A self-signup store has none, falls through to the `else` at line 244, and gets `throw redirect(303, '/onboarding')` — **an infinite loop.** This is the one thing that must be fixed for any of this to work.

```ts
const [{ data: buyerAccess }, { data: storeAccess }] = await Promise.all([
  supabase.from('account_users').select('*, accounts(*, organizations(*))').eq('profile_id', user.id),
  supabase.from('store_users').select('*, stores(*)').eq('profile_id', user.id)
]);

if (buyerAccess?.length || storeAccess?.length) {
  locals.isBuyer = true;
  locals.buyerAccounts = buyerAccess ?? [];   // [] for a fresh store
  locals.store = storeAccess?.[0]?.stores ?? null;
  locals.buyerBrandIds = ...                  // [] when no accounts
  locals.organization = ...                   // only when buyerAccounts is non-empty
}
```

Two invariants change. Every consumer must tolerate them:

- **`locals.buyerAccounts` can now be `[]` for a valid buyer.** Previously non-empty by construction.
- **`locals.organization` can be `null` for a valid buyer.** Previously always set from `buyerAccounts[0].accounts.organization_id` (`hooks.server.ts:234-241`).

Mid-wizard (after step 1, before step 3) a user has no `store_users` row and is correctly still "neither org member nor buyer," so `/onboarding` remains the right destination. This works only because `create-store` fires at step 3. It needs a test.

### `src/routes/onboarding/+page.server.ts:18`

Bounces on `organization?.onboarding_completed_at`. Add the store branch: bounce to `/dashboard` on `store?.onboarding_completed_at`.

### `src/routes/auth/callback/+server.ts`

Checks org membership (line 37), then `account_users` (line 48), then falls to `/onboarding`. Insert a `store_users` check alongside `account_users`; both route to `/dashboard`.

### Downstream consumers

| File                            | Line | Today                                                       | With a store user                             |
| ------------------------------- | ---- | ----------------------------------------------------------- | --------------------------------------------- |
| `account/+page.server.ts`       | 11   | `buyerAccounts[0].account_id`                               | `undefined` → render empty profile            |
| `shop/checkout/+page.server.ts` | 16   | `buyerAccounts[0].account_id`                               | `undefined` → unreachable (no brands to shop) |
| `dashboard/+page.svelte`        | 22   | `buyerAccounts[0].accounts.business_name ?? 'your account'` | should read `store.business_name`             |
| `+layout.server.ts`             | 20   | `if (locals.organization && ...)`                           | already guarded                               |

`dashboard/+page.server.ts` already survives zero accounts: `accountIds ?? []` (line 13) and the `['__none__']` sentinel (line 26) return empty rather than throw.

`/dashboard` and `/shop` with zero `buyerBrandIds` need empty states using the canonical full-page pattern from `CLAUDE.md`: inline SVG at `mx-auto h-16 w-16 text-foreground`, `stroke-width="0.4"`, no fill, no circle background, no dashed border. Title `mt-4 text-lg font-semibold`, subtitle `mt-2 text-sm text-muted-foreground`.

## Testing

**Unit** (colocated `*.test.ts`):

- `create-store`: idempotency (second call returns the same store, no duplicate `store_users`); first user gets `buyer_admin`; missing `business_name` rejected.
- Hooks buyer-resolution: `store_users` only → `isBuyer` true, `buyerAccounts: []`, `organization: null`. `account_users` only → unchanged from today (regression guard). Both → union.

**RLS** (this is a new table; these are the assertions that matter):

- A store user reads their own `stores` row; a second store's user gets zero rows.
- A brand-org admin and a rep-org admin each get **zero rows** selecting `stores`. This proves the public read surface was not opened early.

**Manual — required, cannot be typechecked.** Sign up as a store end-to-end, then load `/dashboard`, `/shop`, `/account`, `/account/team` with zero linked accounts.

The four `locals.organization` / `buyerAccounts` consumers above were found by grep. A zero-account buyer session has never existed, so no code has ever been exercised against one. There may be a component reading `organization.name` that grep did not surface. Clicking through is the only way to find it.

## Out of scope for v1

- The `stores` public/searchable read surface, and its public/private column split.
- Brand-side search UI and "add client from directory."
- Brand-initiated claim of existing unlinked `accounts` rows, and the match heuristic (contact-email exact match, then business name + zip fuzzy).
- Read-through of identity fields from `stores` into `accounts`. `accounts.store_id` exists; nothing reads it.
- Store team invites. `/account/team` already exists, and a store signing up solo has nobody to invite.
- Store onboarding welcome carousel.

## Phase 2 (not designed here)

Discovery and linking. Brand-initiated claim: a brand opening an unlinked account sees "This looks like Anderson & Co on Threadline — link?", confirms, and `store_id` is set. The brand controls its own row; no approval round-trip.

The rejected alternative was store-initiated claim, which would tell any store that signs up exactly which brands already hold their record — a privacy leak and a soft enumeration oracle.

Every account in the system today is an unlinked row. Discovery only helps net-new clients until phase 2 solves matching.
