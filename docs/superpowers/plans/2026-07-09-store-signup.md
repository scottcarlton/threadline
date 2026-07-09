# Store Self-Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store (retailer) signs up unaided, gets a `stores` row, and lands on the existing buyer portal with correct empty states.

**Architecture:** A store is NOT an `organizations` row. Two new tables (`stores`, `store_users`) plus a nullable `accounts.store_id` seam. `org_type` stays `('rep','brand')`. Store users are buyers: `locals.isBuyer = true` with `buyerAccounts: []` and `organization: null`. Two pieces of logic are extracted from inline code into testable server modules (`stores.ts`, `buyer-context.ts`) because the repo's test convention (`src/lib/server/connections.test.ts`) tests extracted functions taking a `SupabaseClient`, not `RequestHandler`s.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Supabase (Postgres + RLS + `@supabase/ssr`), Vitest, Tailwind v4, bun.

**Spec:** `docs/superpowers/specs/2026-07-09-store-signup-design.md`

**Working directory:** `/Users/scottcarlton/Sites/threadline/.worktrees/store-signup` (branch `feat/store-signup`). All paths below are relative to it. All commands run from it.

---

## Corrections to the spec, discovered while planning

The spec was written before every file was read. Three things it got wrong. This plan is authoritative where they conflict.

1. **`/shop` already has the canonical empty state.** `src/routes/shop/+page.svelte:143-156` — correct icon classes, `stroke-width="0.4"`, "No brands available". **No work needed on `/shop`.** The spec claimed it needed one.
2. **`/dashboard` has no empty state, and has two dead links.** `src/routes/dashboard/+page.svelte:41-84` renders "Shop Now" → `/shop` and "New Order" → `/orders/new`. A store with zero brands hits both as dead ends, and `/orders/new` is an org-member route. The spec missed this. Task 8 fixes it.
3. **There is no automated RLS test harness.** `src/lib/server/federation.test.ts:6-7` states RLS enforcement tests are stubs gated behind `VITEST_RLS=1`. The spec promised RLS tests. This plan verifies RLS with `psql` against local Supabase (Task 1, Step 6) and does not pretend an automated harness exists.

---

## File Structure

**Create:**

| Path                                                  | Responsibility                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `supabase/migrations/20260709000001_store_signup.sql` | `stores`, `store_users`, `accounts.store_id`, RLS helpers + policies |
| `src/lib/server/stores.ts`                            | `createStore()` — idempotent store + founding `store_users` insert   |
| `src/lib/server/stores.test.ts`                       | unit tests for `createStore()`                                       |
| `src/lib/server/buyer-context.ts`                     | `resolveBuyerContext()` — unions `account_users` + `store_users`     |
| `src/lib/server/buyer-context.test.ts`                | unit tests for `resolveBuyerContext()`                               |
| `src/routes/api/onboarding/create-store/+server.ts`   | thin POST wrapper around `createStore()`                             |

**Modify:**

| Path                                          | Change                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib/types/database.ts`                   | add `Store`, `StoreUser` interfaces; add `store_id` to `Account`                              |
| `src/app.d.ts`                                | add `store: Store \| null` to `Locals` and `PageData`                                         |
| `src/hooks.server.ts:214-243`                 | call `resolveBuyerContext()`; store users no longer fall to the `/onboarding` redirect        |
| `src/routes/auth/callback/+server.ts:48-57`   | check `store_users` alongside `account_users`                                                 |
| `src/routes/+layout.server.ts:97-103`         | pass `store` through to `PageData`                                                            |
| `src/routes/onboarding/+page.server.ts`       | bounce on `store.onboarding_completed_at`; return `store`                                     |
| `src/routes/onboarding/+page.svelte`          | third "Store" card; `saveStoreType()`; store-aware `finish()`, step persistence, `stepLabels` |
| `src/routes/dashboard/+page.svelte`           | store name in header; empty state; hide dead quick-actions                                    |
| `src/routes/account/+page.server.ts:11`       | guard `undefined` `accountId`                                                                 |
| `src/routes/shop/checkout/+page.server.ts:16` | guard `undefined` `accountId`                                                                 |

---

## ⚠️ Two decisions requiring user sign-off before Task 7 and Task 8

These are user-facing and MUST NOT be improvised. Per `CLAUDE.md` ("Do not guess"), and the stored rules "Confirm before editing UI" and "Icons: copy Remix Icon paths verbatim, never draw your own `d=`".

**(a) Step-3 store card copy.** Existing sibling cards are one-line first-person role statements:

- Brand — _"I manage my product catalog, track orders across all sales channels, and work with reps."_
- Independent Sales Rep — _"I represent multiple brands and manage accounts, orders, and commissions."_

Proposed, drafted against `docs/brand/guidelines.md` §1.5 (direct, specific, no superlatives, lead with outcome):

> **Store**
> _"I buy wholesale from brands and want my orders and account details in one place."_

**Do not ship this without approval.** Note it deliberately avoids promising reorder/sell-through features the empty v1 portal does not deliver.

**(b) Icons.** Do NOT draw new SVG paths. For the store card, reuse the shopping-bag path already present verbatim in this repo at `src/routes/dashboard/+page.svelte:64` (identical to `src/routes/shop/+page.svelte:150`), and mirror the sibling cards' `<svg>` attributes exactly. If a distinct storefront glyph is wanted, the user must supply the Remix Icon path.

Ask the user to confirm (a) and (b) before starting Task 7.

---

## Task 1: Migration — `stores`, `store_users`, `accounts.store_id`, RLS

**Files:**

- Create: `supabase/migrations/20260709000001_store_signup.sql`

- [ ] **Step 1: Confirm local Supabase is running**

Run:

```bash
docker exec -i supabase_db_threadline psql -U postgres -d postgres -c "select current_database();"
```

Expected: one row, `postgres`. If this fails, run `bunx supabase start` first. Never apply this migration against a remote project.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260709000001_store_signup.sql`:

```sql
-- ============================================================
-- Store self-signup: stores, store_users, accounts.store_id
--
-- A store (retailer) is NOT an organizations row. Widening
-- organizations.org_type to include 'store' would push a third org type
-- through every `.eq('organization_id', ...)` filter, every RLS policy
-- that assumes rep|brand, and get_connected_org_ids(). See
-- docs/superpowers/specs/2026-07-09-store-signup-design.md.
--
-- A store user is a buyer with an identity but (initially) zero accounts.
-- ============================================================

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

-- No slug. create-org slugifies and 409s on collision; two real stores can
-- legitimately share a business name, and a uniqueness constraint here would
-- reject valid signups. Stores have no public URL in v1.

CREATE TABLE store_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'buyer_admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, profile_id)
);

CREATE INDEX idx_store_users_profile_id ON store_users(profile_id);
CREATE INDEX idx_store_users_store_id ON store_users(store_id);

-- The seam for phase-2 brand-initiated linking. Written by nothing in v1.
ALTER TABLE accounts ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX idx_accounts_store_id ON accounts(store_id) WHERE store_id IS NOT NULL;

-- ============================================================
-- Helpers (SECURITY DEFINER, so they bypass RLS and cannot recurse)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM store_users WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_store_admin(_store_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_users
    WHERE store_id = _store_id
      AND profile_id = auth.uid()
      AND role = 'buyer_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RLS — deliberately closed.
--
-- No brand or rep can read `stores` in v1. The cross-org searchable
-- directory is the first table scoped by neither org nor connection; phase 2
-- opens that read surface deliberately, with its own review and its own
-- public/private column split. It does not arrive as a side effect of signup.
--
-- There is no INSERT policy on either table: rows are created exclusively by
-- supabaseAdmin in createStore() (@supabase/ssr drops the JWT on writes).
-- ============================================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store users see own store"
  ON stores FOR SELECT
  USING (id IN (SELECT get_user_store_ids()));

CREATE POLICY "Store admins update own store"
  ON stores FOR UPDATE
  USING (is_store_admin(id))
  WITH CHECK (is_store_admin(id));

ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store users see own membership"
  ON store_users FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Store users see teammates"
  ON store_users FOR SELECT
  USING (store_id IN (SELECT get_user_store_ids()));

CREATE POLICY "Store admins manage team"
  ON store_users FOR UPDATE
  USING (is_store_admin(store_id))
  WITH CHECK (is_store_admin(store_id));

CREATE POLICY "Store admins remove team"
  ON store_users FOR DELETE
  USING (is_store_admin(store_id));
```

- [ ] **Step 3: Apply the migration**

Run (from the worktree, not the main repo):

```bash
bunx supabase migration up
```

Expected: `Applying migration 20260709000001_store_signup.sql...` and no error.

- [ ] **Step 4: Reload the PostgREST schema cache**

Run:

```bash
docker exec -i supabase_db_threadline psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
```

Expected: `NOTIFY`. Skipping this makes the new tables 404 from the JS client even though they exist.

- [ ] **Step 5: Verify the columns exist**

Run:

```bash
docker exec -i supabase_db_threadline psql -U postgres -d postgres -c "\d stores" \
  -c "\d store_users" \
  -c "select column_name from information_schema.columns where table_name='accounts' and column_name='store_id';"
```

Expected: both tables printed; final query returns one row, `store_id`.

- [ ] **Step 6: Verify RLS is closed to brands and reps**

This is the assertion that proves the public read surface was not opened early. Run:

```bash
docker exec -i supabase_db_threadline psql -U postgres -d postgres <<'SQL'
BEGIN;

-- Seed a store owned by nobody in particular.
INSERT INTO stores (id, business_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'RLS Probe Store');

-- Simulate an authenticated user who is NOT a store user.
-- SET LOCAL requires a transaction block, hence the BEGIN above.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
SELECT count(*) AS should_be_zero FROM stores;

RESET ROLE;
ROLLBACK;  -- discards the probe row; no cleanup DELETE needed
SQL
```

Expected: `should_be_zero | 0`. If it returns 1, a policy is too permissive — stop and fix before continuing.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260709000001_store_signup.sql
git commit -m "feat(db): add stores, store_users, accounts.store_id with closed RLS"
```

---

## Task 2: Types

**Files:**

- Modify: `src/lib/types/database.ts`
- Modify: `src/app.d.ts`

`src/lib/types/database.ts` is hand-written (interfaces, not generated). Add these near the existing `AccountUser` interface (around line 661).

- [ ] **Step 1: Add the `Store` and `StoreUser` interfaces**

```ts
export interface Store {
	id: string;
	business_name: string;
	website: string | null;
	phone: string | null;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	country: string | null;
	onboarding_step: number;
	onboarding_completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface StoreUser {
	id: string;
	store_id: string;
	profile_id: string;
	role: 'buyer' | 'buyer_admin';
	created_at: string;
}
```

- [ ] **Step 2: Add `store_id` to the existing `Account` interface**

In `interface Account` (starts line 268), add:

```ts
store_id: string | null;
```

- [ ] **Step 3: Add `store` to `App.Locals` and `App.PageData`**

In `src/app.d.ts`, extend the import:

```ts
import type {
	Profile,
	Organization,
	OrganizationMember,
	OrgType,
	AccountUser,
	Store
} from '$lib/types/database';
```

Then add to **both** `interface Locals` and `interface PageData`, directly after the `buyerBrandIds` line:

```ts
store: Store | null;
```

- [ ] **Step 4: Typecheck**

Run: `bun run check`
Expected: 0 errors. (`locals.store` is not yet assigned anywhere; the type is `Store | null` and `hooks.server.ts` initializes locals, so this compiles. If `check` reports `store` missing on an object literal in `hooks.server.ts` or `+layout.server.ts`, that is expected and fixed in Tasks 4 and 5 — note the error and continue only if it is exactly that. Any other error must be fixed now.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/database.ts src/app.d.ts
git commit -m "feat(types): add Store, StoreUser, locals.store"
```

---

## Task 3: `createStore()` server module (TDD)

**Files:**

- Create: `src/lib/server/stores.ts`
- Test: `src/lib/server/stores.test.ts`

Mirrors the idempotency guarantee of `create-org` (`src/routes/api/onboarding/create-org/+server.ts:21-31`): a refresh, resubmit, or bounce back into `/onboarding` must never create a second store.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/stores.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createStore } from './stores.js';

type TableResponses = {
	store_users_existing?: { data: unknown; error: null };
	stores_insert?: { data: unknown; error: { message: string } | null };
	store_users_insert?: { error: { message: string } | null };
	profiles_update?: { error: null };
};

/**
 * Minimal chainable Supabase mock. Records every insert payload by table so
 * tests can assert what was written.
 */
function makeMock(responses: TableResponses = {}) {
	const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

	const client = {
		from(table: string) {
			const builder: Record<string, unknown> = {
				select: () => builder,
				eq: () => builder,
				limit: () => builder,
				maybeSingle: () => {
					if (table === 'store_users') {
						return Promise.resolve(responses.store_users_existing ?? { data: null, error: null });
					}
					return Promise.resolve({ data: null, error: null });
				},
				single: () => {
					if (table === 'stores') {
						return Promise.resolve(
							responses.stores_insert ?? {
								data: { id: 'store-1', business_name: 'Anderson & Co' },
								error: null
							}
						);
					}
					return Promise.resolve({ data: null, error: null });
				},
				insert: (payload: Record<string, unknown>) => {
					inserts.push({ table, payload });
					if (table === 'store_users') {
						return Promise.resolve(responses.store_users_insert ?? { error: null });
					}
					return builder;
				},
				update: () => builder
			};
			return builder;
		}
	} as unknown as SupabaseClient;

	return { client, inserts };
}

describe('createStore', () => {
	it('creates a store and a founding buyer_admin store_users row', async () => {
		const { client, inserts } = makeMock();

		const result = await createStore(client, {
			userId: 'user-1',
			businessName: 'Anderson & Co',
			displayName: 'Dana Anderson'
		});

		expect(result.error).toBeUndefined();
		expect(result.store).toEqual({ id: 'store-1', business_name: 'Anderson & Co' });

		const storeInsert = inserts.find((i) => i.table === 'stores');
		expect(storeInsert?.payload).toEqual({ business_name: 'Anderson & Co' });

		const memberInsert = inserts.find((i) => i.table === 'store_users');
		expect(memberInsert?.payload).toEqual({
			store_id: 'store-1',
			profile_id: 'user-1',
			role: 'buyer_admin'
		});
	});

	it('is idempotent — an existing store_users row short-circuits, inserting nothing', async () => {
		const { client, inserts } = makeMock({
			store_users_existing: {
				data: { stores: { id: 'store-existing', business_name: 'Anderson & Co' } },
				error: null
			}
		});

		const result = await createStore(client, {
			userId: 'user-1',
			businessName: 'Anderson & Co',
			displayName: 'Dana Anderson'
		});

		expect(result.store).toEqual({ id: 'store-existing', business_name: 'Anderson & Co' });
		expect(inserts).toHaveLength(0);
	});

	it('rejects a blank business name without touching the database', async () => {
		const { client, inserts } = makeMock();

		const result = await createStore(client, {
			userId: 'user-1',
			businessName: '   ',
			displayName: 'Dana Anderson'
		});

		expect(result.error).toBe('Business name is required');
		expect(result.status).toBe(400);
		expect(inserts).toHaveLength(0);
	});

	it('trims the business name before insert', async () => {
		const { client, inserts } = makeMock();

		await createStore(client, {
			userId: 'user-1',
			businessName: '  Anderson & Co  ',
			displayName: 'Dana Anderson'
		});

		const storeInsert = inserts.find((i) => i.table === 'stores');
		expect(storeInsert?.payload).toEqual({ business_name: 'Anderson & Co' });
	});

	it('surfaces a store insert error and does not insert a membership', async () => {
		const { client, inserts } = makeMock({
			stores_insert: { data: null, error: { message: 'boom' } }
		});

		const result = await createStore(client, {
			userId: 'user-1',
			businessName: 'Anderson & Co',
			displayName: 'Dana Anderson'
		});

		expect(result.error).toBe('boom');
		expect(result.status).toBe(500);
		expect(inserts.find((i) => i.table === 'store_users')).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/lib/server/stores.test.ts`
Expected: FAIL — `Failed to resolve import "./stores.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/server/stores.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Store } from '$lib/types/database';

export type CreateStoreInput = {
	userId: string;
	businessName: string;
	displayName?: string;
};

export type CreateStoreResult = {
	store?: Store;
	error?: string;
	status?: number;
};

/**
 * Creates a store and its founding buyer_admin membership.
 *
 * Idempotent: if the user already has a store_users row we return that store
 * rather than inserting a second one. Mirrors the founding-admin check in
 * create-org — a refresh, resubmit, or bounce back into /onboarding must not
 * mint duplicates.
 *
 * `client` must be supabaseAdmin: @supabase/ssr v0.10.0 drops the JWT on
 * writes, so the caller performs the auth check at the app layer.
 */
export async function createStore(
	client: SupabaseClient,
	{ userId, businessName, displayName }: CreateStoreInput
): Promise<CreateStoreResult> {
	const name = businessName?.trim();
	if (!name) {
		return { error: 'Business name is required', status: 400 };
	}

	const { data: existing } = await client
		.from('store_users')
		.select('stores(*)')
		.eq('profile_id', userId)
		.limit(1)
		.maybeSingle();

	const existingStore = (existing as { stores?: Store } | null)?.stores;
	if (existingStore) {
		return { store: existingStore };
	}

	if (displayName) {
		await client.from('profiles').update({ display_name: displayName }).eq('id', userId);
	}

	const { data: store, error: storeError } = await client
		.from('stores')
		.insert({ business_name: name })
		.select()
		.single();

	if (storeError || !store) {
		return { error: storeError?.message ?? 'Failed to create store', status: 500 };
	}

	// First user of a store is its admin — matches buyer-invite/send:69-78.
	const { error: memberError } = await client.from('store_users').insert({
		store_id: store.id,
		profile_id: userId,
		role: 'buyer_admin'
	});

	if (memberError) {
		return { error: memberError.message, status: 500 };
	}

	return { store: store as Store };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/lib/server/stores.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/stores.ts src/lib/server/stores.test.ts
git commit -m "feat(server): add idempotent createStore()"
```

---

## Task 4: `POST /api/onboarding/create-store`

**Files:**

- Create: `src/routes/api/onboarding/create-store/+server.ts`

- [ ] **Step 1: Write the endpoint**

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { createStore } from '$lib/server/stores.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { storeName, displayName } = await request.json();

	const result = await createStore(supabaseAdmin, {
		userId: session.user.id,
		businessName: storeName,
		displayName
	});

	if (result.error) {
		return json({ error: result.error }, { status: result.status ?? 500 });
	}

	return json({ store: result.store });
};
```

- [ ] **Step 2: Typecheck**

Run: `bun run check`
Expected: 0 new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/onboarding/create-store/+server.ts
git commit -m "feat(api): add POST /api/onboarding/create-store"
```

---

## Task 5: `resolveBuyerContext()` — fix the redirect loop (TDD)

**Files:**

- Create: `src/lib/server/buyer-context.ts`
- Test: `src/lib/server/buyer-context.test.ts`
- Modify: `src/hooks.server.ts:214-243`

This is the load-bearing fix. Today `hooks.server.ts:215-218` derives `isBuyer` from `account_users` alone; a store user has none, falls to the `else` at line 244, and is redirected to `/onboarding` — **forever**.

Two invariants change and every consumer must tolerate them:

- `locals.buyerAccounts` can now be `[]` for a valid buyer (previously non-empty by construction).
- `locals.organization` can now be `null` for a valid buyer (previously always set from `buyerAccounts[0]`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/buyer-context.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBuyerContext } from './buyer-context.js';

function makeClients({
	accountUsers = [] as unknown[],
	storeUsers = [] as unknown[],
	brandAccess = [] as unknown[],
	organization = null as unknown
}) {
	const client = {
		from(table: string) {
			const builder: Record<string, unknown> = {
				select: () => builder,
				eq: () => (table === 'organizations' ? builder : Promise.resolve({ data: rowsFor(table) })),
				in: () => Promise.resolve({ data: rowsFor(table) }),
				single: () => Promise.resolve({ data: organization })
			};
			return builder;
		}
	} as unknown as SupabaseClient;

	function rowsFor(table: string) {
		if (table === 'account_users') return accountUsers;
		if (table === 'store_users') return storeUsers;
		if (table === 'account_brand_access') return brandAccess;
		return [];
	}

	return { client, admin: client };
}

const STORE = { id: 'store-1', business_name: 'Anderson & Co' };

describe('resolveBuyerContext', () => {
	it('returns isBuyer=false when the user is neither a buyer nor a store user', async () => {
		const { client, admin } = makeClients({});
		const ctx = await resolveBuyerContext(client, admin, 'user-1');
		expect(ctx.isBuyer).toBe(false);
	});

	it('a store user with zero accounts is a buyer with [] accounts and null organization', async () => {
		const { client, admin } = makeClients({
			storeUsers: [{ store_id: 'store-1', profile_id: 'user-1', stores: STORE }]
		});

		const ctx = await resolveBuyerContext(client, admin, 'user-1');

		expect(ctx.isBuyer).toBe(true);
		expect(ctx.buyerAccounts).toEqual([]);
		expect(ctx.buyerBrandIds).toEqual([]);
		expect(ctx.organization).toBeNull();
		expect(ctx.store).toEqual(STORE);
	});

	it('an invited buyer with accounts and no store keeps todays behavior', async () => {
		const account = { account_id: 'acct-1', accounts: { organization_id: 'org-1' } };
		const { client, admin } = makeClients({
			accountUsers: [account],
			brandAccess: [{ brand_id: 'brand-1' }],
			organization: { id: 'org-1', name: 'Acme' }
		});

		const ctx = await resolveBuyerContext(client, admin, 'user-1');

		expect(ctx.isBuyer).toBe(true);
		expect(ctx.buyerAccounts).toEqual([account]);
		expect(ctx.buyerBrandIds).toEqual(['brand-1']);
		expect(ctx.organization).toEqual({ id: 'org-1', name: 'Acme' });
		expect(ctx.store).toBeNull();
	});

	it('a user who is both a store user and an invited buyer gets the union', async () => {
		const account = { account_id: 'acct-1', accounts: { organization_id: 'org-1' } };
		const { client, admin } = makeClients({
			accountUsers: [account],
			storeUsers: [{ store_id: 'store-1', profile_id: 'user-1', stores: STORE }],
			brandAccess: [{ brand_id: 'brand-1' }],
			organization: { id: 'org-1', name: 'Acme' }
		});

		const ctx = await resolveBuyerContext(client, admin, 'user-1');

		expect(ctx.isBuyer).toBe(true);
		expect(ctx.buyerAccounts).toEqual([account]);
		expect(ctx.store).toEqual(STORE);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/lib/server/buyer-context.test.ts`
Expected: FAIL — `Failed to resolve import "./buyer-context.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/server/buyer-context.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Organization, Store } from '$lib/types/database';

export type BuyerAccountRow = {
	account_id: string;
	accounts?: { organization_id?: string } & Record<string, unknown>;
};

export type BuyerContext = {
	isBuyer: boolean;
	buyerAccounts: BuyerAccountRow[];
	buyerBrandIds: string[];
	organization: Organization | null;
	store: Store | null;
};

const NOT_A_BUYER: BuyerContext = {
	isBuyer: false,
	buyerAccounts: [],
	buyerBrandIds: [],
	organization: null,
	store: null
};

/**
 * Resolves buyer identity for a user with no organization_members row.
 *
 * A buyer is either:
 *   - an invited buyer (account_users, created by /api/buyer-invite), or
 *   - a self-signup store user (store_users, created by /api/onboarding/create-store).
 *
 * A store user has zero accounts until a brand links them, so `buyerAccounts`
 * may be `[]` and `organization` may be `null` for a perfectly valid buyer.
 * Callers must not assume buyerAccounts[0] exists.
 *
 * `admin` must be supabaseAdmin — account_brand_access and organizations are
 * read past RLS, as they were before this was extracted from hooks.server.ts.
 */
export async function resolveBuyerContext(
	client: SupabaseClient,
	admin: SupabaseClient,
	userId: string
): Promise<BuyerContext> {
	const [{ data: buyerAccess }, { data: storeAccess }] = await Promise.all([
		client
			.from('account_users')
			.select('*, accounts(*, organizations(*))')
			.eq('profile_id', userId),
		client.from('store_users').select('*, stores(*)').eq('profile_id', userId)
	]);

	const accounts = (buyerAccess ?? []) as BuyerAccountRow[];
	const stores = (storeAccess ?? []) as Array<{ stores?: Store }>;

	if (!accounts.length && !stores.length) {
		return NOT_A_BUYER;
	}

	let buyerBrandIds: string[] = [];
	let organization: Organization | null = null;

	if (accounts.length) {
		const accountIds = accounts.map((a) => a.account_id);
		const { data: brandAccess } = await admin
			.from('account_brand_access')
			.select('brand_id')
			.in('account_id', accountIds);
		buyerBrandIds = ((brandAccess ?? []) as Array<{ brand_id: string }>).map((b) => b.brand_id);

		const orgId = accounts[0]?.accounts?.organization_id;
		if (orgId) {
			const { data: org } = await admin.from('organizations').select('*').eq('id', orgId).single();
			organization = (org as Organization) ?? null;
		}
	}

	return {
		isBuyer: true,
		buyerAccounts: accounts,
		buyerBrandIds,
		organization,
		store: stores[0]?.stores ?? null
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/lib/server/buyer-context.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into `hooks.server.ts`**

Add the import at the top of `src/hooks.server.ts`:

```ts
import { resolveBuyerContext } from '$lib/server/buyer-context';
```

Replace the entire `else` block at `src/hooks.server.ts:213-254` (the block beginning `} else {` with the comment `// Check if user is a buyer`, through the closing of its inner `else`) with:

```ts
		} else {
			const buyerCtx = await resolveBuyerContext(supabase, supabaseAdmin, user.id);

			if (buyerCtx.isBuyer) {
				event.locals.user = profile;
				event.locals.isBuyer = true;
				event.locals.buyerAccounts = buyerCtx.buyerAccounts;
				event.locals.buyerBrandIds = buyerCtx.buyerBrandIds;
				event.locals.store = buyerCtx.store;
				// A self-signup store has no linked accounts yet, so no org.
				if (buyerCtx.organization) event.locals.organization = buyerCtx.organization;
			} else {
				// No org membership and not a buyer — redirect to onboarding.
				// Mid-wizard store signups land here correctly: they have no
				// store_users row until step 3 calls create-store.
				event.locals.user = profile;
				if (
					!event.url.pathname.startsWith('/onboarding') &&
					!event.url.pathname.startsWith('/api/')
				) {
					throw redirect(303, '/onboarding');
				}
			}
		}
```

Also initialize `store` wherever the other `locals` defaults are set (search for `event.locals.isBuyer = false` or the locals initialization block near the top of `authHandle`) and add:

```ts
event.locals.store = null;
```

If no such initialization block exists, add `event.locals.store = null;` immediately before the `if (allMemberships?.length) {` line so org members and system admins get a defined value.

- [ ] **Step 6: Verify nothing regressed**

Run: `bun run check && bunx vitest run`
Expected: 0 type errors; all tests pass. The pre-existing `BuyerAccountRow` type in `hooks.server.ts` may now be unused — if `check` flags it, delete the local declaration and import the one from `buyer-context.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/buyer-context.ts src/lib/server/buyer-context.test.ts src/hooks.server.ts
git commit -m "fix(auth): treat store users as buyers, ending the onboarding redirect loop"
```

---

## Task 6: Route store users to `/dashboard` after OAuth, and out of `/onboarding` when done

**Files:**

- Modify: `src/routes/auth/callback/+server.ts:48-57`
- Modify: `src/routes/onboarding/+page.server.ts`
- Modify: `src/routes/+layout.server.ts`

- [ ] **Step 1: Add the `store_users` check to the OAuth callback**

In `src/routes/auth/callback/+server.ts`, replace the `buyerAccess` block (lines 48-57):

```ts
const { data: buyerAccess } = await supabase
	.from('account_users')
	.select('id')
	.eq('profile_id', user.id)
	.limit(1)
	.single();

if (buyerAccess) {
	throw redirect(303, '/dashboard');
}
```

with:

```ts
const [{ data: buyerAccess }, { data: storeAccess }] = await Promise.all([
	supabase.from('account_users').select('id').eq('profile_id', user.id).limit(1).maybeSingle(),
	supabase.from('store_users').select('id').eq('profile_id', user.id).limit(1).maybeSingle()
]);

if (buyerAccess || storeAccess) {
	throw redirect(303, '/dashboard');
}
```

Note the `.single()` → `.maybeSingle()` change: `.single()` errors when zero rows match, which the old code swallowed via destructuring. `.maybeSingle()` is the correct call for an existence check and is what the rest of the codebase uses (`create-org:26`).

- [ ] **Step 2: Bounce a finished store out of `/onboarding`**

In `src/routes/onboarding/+page.server.ts`, change the destructure and add the store branch:

```ts
export const load: PageServerLoad = async ({ locals }) => {
	const { organization, store, user, supabase } = locals;

	if (!user) {
		throw redirect(303, '/login');
	}

	// A store that finished onboarding belongs in the buyer portal.
	if (store?.onboarding_completed_at) {
		throw redirect(303, '/dashboard');
	}

	if (organization?.onboarding_completed_at) {
		throw redirect(303, '/insight');
	}
```

and add `store` to the returned object:

```ts
return {
	organization: organization ?? null,
	store: store ?? null,
	seasons: seasons as { id: string; name: string }[],
	user
};
```

- [ ] **Step 3: Pass `store` through the root layout**

In `src/routes/+layout.server.ts`, in the returned object (near line 97-103, beside `buyerAccounts`), add:

```ts
		store: locals.store,
```

- [ ] **Step 4: Verify**

Run: `bun run check && bunx vitest run`
Expected: 0 errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/auth/callback/+server.ts src/routes/onboarding/+page.server.ts src/routes/+layout.server.ts
git commit -m "feat(auth): route store users to the buyer portal"
```

---

## Task 7: Onboarding — the third card

> **BLOCKED on user sign-off for copy (a) and icon (b).** See the sign-off section above. Do not improvise either.

**Files:**

- Modify: `src/routes/onboarding/+page.svelte`

- [ ] **Step 1: Widen the account-type state**

At `src/routes/onboarding/+page.svelte:54`, change:

```ts
let orgType = $state<'rep' | 'brand' | null>(null);
```

to:

```ts
let orgType = $state<'rep' | 'brand' | 'store' | null>(null);
```

- [ ] **Step 2: Add the store to `effectiveOrgType` and `stepLabels`**

At line ~324, `effectiveOrgType` currently defaults to `'rep'`. Replace the `stepLabels` derivation so a store gets a three-step indicator:

```ts
const effectiveOrgType = $derived(orgType ?? 'rep');
const stepLabels = $derived(
	effectiveOrgType === 'store'
		? [
				{ number: 1, label: 'Your Name' },
				{ number: 2, label: 'Your Business' },
				{ number: 3, label: 'Business Type' }
			]
		: effectiveOrgType === 'brand'
			? [
					{ number: 1, label: 'Your Name' },
					{ number: 2, label: 'Your Business' },
					{ number: 3, label: 'Business Type' },
					{ number: 4, label: 'Catalog' },
					{ number: 5, label: 'Invite Members' },
					{ number: 6, label: 'Get Started' }
				]
			: [
					{ number: 1, label: 'Your Name' },
					{ number: 2, label: 'Your Business' },
					{ number: 3, label: 'Business Type' },
					{ number: 4, label: 'First Brand' },
					{ number: 5, label: 'Invite Members' },
					{ number: 6, label: 'Get Started' }
				]
);
```

- [ ] **Step 3: Add `saveStoreType()` and branch `saveOrgType()`**

`saveOrgType()` (line 435) posts to `/api/onboarding/create-org`. A store must not. Add a sibling function immediately after `saveOrgType()`:

```ts
async function saveStoreType() {
	loading = true;
	error = '';

	const res = await fetch('/api/onboarding/create-store', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			storeName: orgName.trim(),
			displayName: displayName
		})
	});

	loading = false;

	if (!res.ok) {
		const body = await res.json();
		error = body.error || 'Failed to create store';
		return;
	}

	const { store } = await res.json();
	await supabase
		.from('stores')
		.update({ onboarding_completed_at: new Date().toISOString() })
		.eq('id', store.id);

	window.location.href = '/dashboard';
}
```

A store's wizard ends at step 3, so `onboarding_completed_at` is set here rather than in `finish()`. There is no step-6 welcome carousel for stores — its copy is rep/brand specific.

- [ ] **Step 4: Add the third card to the step-3 markup**

After the Independent Sales Rep card (which ends around line 805), add a third card. It mirrors the sibling cards' structure exactly; the only differences are `orgType === 'store'`, the click handler, the icon path, and the copy.

Use the **approved** copy from sign-off (a). Use the shopping-bag `d` copied **verbatim** from `src/routes/dashboard/+page.svelte:64` per sign-off (b) — do not draw a new path.

```svelte
<button
	class="group flex w-full items-start gap-4 rounded-lg border p-5 text-left transition-colors duration-200 {orgType ===
	'store'
		? 'border-foreground'
		: 'border-border hover:border-foreground'}"
	onclick={() => {
		orgType = 'store';
		saveStoreType();
	}}
>
	<div
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 {orgType ===
		'store'
			? 'bg-foreground text-background'
			: 'bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background'}"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
			/>
		</svg>
	</div>
	<div>
		<p class="font-medium">Store</p>
		<p class="mt-1 text-sm text-muted-foreground">
			<!-- APPROVED COPY FROM SIGN-OFF (a) GOES HERE -->
		</p>
	</div>
</button>
```

Before writing this, open the Brand card at lines 726-760 and copy its exact `<svg>` attribute set and inner `<div>` structure. If the sibling cards use `fill="currentColor"` with no `stroke`, match that instead of the `stroke` form above — mirror, don't assume.

- [ ] **Step 5: Guard the step-persistence effect**

The `$effect` at line ~588 writes `onboarding_step` to `organizations` and early-returns when `data.organization?.id` is falsy. A store has no org, so it early-returns and persists nothing. That is correct for v1 (a store's wizard is three steps and ends by navigating away), so **leave it unchanged**. Do not add store step persistence — YAGNI, and `stores.onboarding_step` defaults to 1.

- [ ] **Step 6: Verify**

Run: `bun run check`
Expected: 0 errors.

Then check the Vite dev console for `state_referenced_locally` warnings (per the stored rule): `bun run dev`, load `/onboarding`, confirm no new warning.

- [ ] **Step 7: Commit**

```bash
git add src/routes/onboarding/+page.svelte
git commit -m "feat(onboarding): add Store as a third business type"
```

---

## Task 8: `/dashboard` — store name, empty state, no dead links

> **BLOCKED on user sign-off** for the empty-state copy below, same reason as Task 7.

**Files:**

- Modify: `src/routes/dashboard/+page.svelte`

Today the dashboard shows `0 / 0 / 0` stats and two quick-action buttons: "Shop Now" → `/shop` (which will correctly show its own "No brands available" empty state) and **"New Order" → `/orders/new`**, which is an org-member route a store must never reach. Both are dead ends for a fresh store.

- [ ] **Step 1: Read the file end-to-end first**

Run: `cat src/routes/dashboard/+page.svelte`

Do not edit from the excerpts in this plan. The stats grid is at lines 31-46, quick actions at 48-84, recent orders at 86+.

- [ ] **Step 2: Source the store name from `locals.store`**

Replace line 22:

```ts
const accountName = $derived(data.buyerAccounts?.[0]?.accounts?.business_name ?? 'your account');
```

with:

```ts
const accountName = $derived(
	data.buyerAccounts?.[0]?.accounts?.business_name ?? data.store?.business_name ?? 'your account'
);
// A self-signup store has no linked accounts and no brand access until a
// brand connects. Everything below the header is meaningless until then.
const hasBrandAccess = $derived((data.buyerBrandIds?.length ?? 0) > 0);
```

- [ ] **Step 3: Gate the body on `hasBrandAccess`**

Wrap the stats grid, quick actions, and recent-orders sections in `{#if hasBrandAccess} ... {:else} ... {/if}`, with the empty state in the `{:else}`.

The empty state MUST follow the canonical full-page pattern from `CLAUDE.md` — verified against the real one at `src/routes/shop/+page.svelte:139-156`:

```svelte
	{:else}
		<div class="py-16 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-16 w-16 text-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="0.4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">No brands yet</p>
			<p class="mt-2 text-sm text-muted-foreground">
				<!-- APPROVED COPY FROM SIGN-OFF GOES HERE -->
			</p>
		</div>
	{/if}
```

Rules that apply and will be checked at review: no `text-xs`; icon is `mx-auto h-16 w-16 text-foreground` with `stroke-width="0.4"`, no fill, **no circle background**, **no dashed border**; title `mt-4 text-lg font-semibold`; subtitle `mt-2 text-sm text-muted-foreground`. The `d` is copied verbatim from the existing bag icon — do not draw a new one.

Proposed subtitle copy for sign-off (drafted against `docs/brand/guidelines.md` §1.5 — states the mechanism plainly, promises nothing the product does not do, gives the store the one action that actually moves them forward):

> _"When a brand connects with you, their catalog and your orders appear here. Share your store details with the brands you buy from."_

- [ ] **Step 4: Verify no dead links remain**

Confirm by reading the diff that `/orders/new` and `/shop` links render **only** inside the `{#if hasBrandAccess}` branch.

- [ ] **Step 5: Verify**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/dashboard/+page.svelte
git commit -m "feat(dashboard): store-aware header and zero-brand empty state"
```

---

## Task 9: Guard the two `buyerAccounts[0]` consumers

**Files:**

- Modify: `src/routes/account/+page.server.ts:11`
- Modify: `src/routes/shop/checkout/+page.server.ts:16`

Both do `locals.buyerAccounts?.[0]?.account_id`, which is now `undefined` for a store user. Neither has ever run against a zero-account buyer, because one could not exist.

- [ ] **Step 1: Read both files end-to-end**

Run: `cat src/routes/account/+page.server.ts src/routes/shop/checkout/+page.server.ts`

- [ ] **Step 2: Guard `/account`**

`accountId` is `undefined`. Return early with a null account rather than issuing a query with `.eq('id', undefined)` (which Supabase turns into a malformed filter). The exact shape depends on what the file returns — read it, then add, immediately after the `accountId` line:

```ts
if (!accountId) {
	// Self-signup store: no linked account yet. Render the profile from
	// locals.store instead of the (non-existent) account row.
	return { account: null, store: locals.store };
}
```

Then make `src/routes/account/+page.svelte` render `data.store?.business_name` when `data.account` is null. Read that file before editing it and match its existing markup; do not restyle it.

- [ ] **Step 3: Guard `/shop/checkout`**

A store with no brand access cannot reach checkout with a non-empty cart, but the route must not 500 if hit directly. After the `accountId` line, add:

```ts
if (!accountId) {
	redirect(303, '/dashboard');
}
```

Ensure `redirect` is imported from `@sveltejs/kit`.

- [ ] **Step 4: Verify**

Run: `bun run check && bunx vitest run`
Expected: 0 errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/account src/routes/shop/checkout
git commit -m "fix(buyer): guard zero-account buyers in /account and /shop/checkout"
```

---

## Task 10: Full verification

No new code. This is the gate before opening a PR. Per `CLAUDE.md`, "State what was verified; if something couldn't be verified, say so explicitly."

- [ ] **Step 1: Typecheck and tests**

```bash
bun run check
bunx vitest run
bun run lint
```

Expected: 0 type errors, all tests pass, lint clean.

- [ ] **Step 2: Manual — sign up as a store end-to-end**

This CANNOT be typechecked and is the only way to find a component reading `organization.name` that grep did not surface. A zero-account buyer session has never existed in this codebase, so no code has ever run against one.

```bash
bun run dev
```

1. Open a private window, go to `/login`, sign up with a fresh email via OTP.
2. Expect `/onboarding`. Complete step 1 (name), step 2 (business name).
3. On step 3, pick **Store**.
4. Expect a redirect to `/dashboard` — **not** `/onboarding`, **not** `/insight`.
5. Confirm the header reads the store's business name.
6. Confirm the empty state renders, and that **no "New Order" or "Shop Now" button is visible**.
7. Navigate to `/shop` — expect "No brands available".
8. Navigate to `/account` — expect the profile to render, not 500.
9. Navigate to `/account/team` — expect it to render, not 500. **If it throws, that is the unfound `locals.organization` consumer. Fix it and add it to this plan.**
10. Navigate to `/insight` — expect a redirect away (buyers do not belong there).
11. Reload `/onboarding` — expect a bounce to `/dashboard`.
12. Sign out, sign back in — expect `/dashboard`, not `/onboarding`. **This is the redirect-loop regression check.**

- [ ] **Step 3: Manual — verify no regression for invited buyers**

Sign in as an existing invited buyer (one with `account_users` rows). Confirm `/dashboard` still shows stats, quick actions, and recent orders exactly as before. This is the invariant most at risk from Task 5.

- [ ] **Step 4: Manual — verify no regression for reps and brands**

Sign in as a rep-org admin and a brand-org admin. Confirm `/insight`, `/accounts`, and `/brands` load. Confirm neither can see the `stores` table:

```bash
docker exec -i supabase_db_threadline psql -U postgres -d postgres \
  -c "select count(*) from stores;"
```

(as `postgres` this returns all rows — the RLS check is Task 1 Step 6, which is the authoritative one.)

- [ ] **Step 5: Self-review the diff against the stored rules**

Run: `git diff dev...HEAD`

Check every changed `.svelte` file for: no `text-xs`; no hand-drawn SVG `d` attributes; no native `<select>`/`<input type=checkbox>`/`title=""`; empty states match the canonical pattern; no unrequested borders, shadows, or dividers.

- [ ] **Step 6: Open the PR**

Use the `git-pre` skill, or:

```bash
git push -u origin feat/store-signup
gh pr create --base dev --title "feat: store self-signup" --body "..."
```

Base branch is `dev`, never `main`.

---

## Self-review of this plan

**Spec coverage:** `stores` + `store_users` + `accounts.store_id` → Task 1. Closed RLS → Task 1. Types → Task 2. `create-store` idempotency + `buyer_admin` → Tasks 3-4. Hooks redirect loop + the two changed invariants → Task 5. `auth/callback` + `/onboarding` bounce → Task 6. Third card → Task 7. Empty states → Task 8. `buyerAccounts[0]` consumers → Task 9. Manual verification → Task 10. No slug, no self-brand, no seasons, no shipping methods, no welcome carousel → Task 3 impl + Task 7 Step 3. Out-of-scope items are absent, as intended.

**Deviations from the spec, all documented above:** `/shop` needs no work (already correct); `/dashboard` needs an empty state _and_ dead-link removal (spec missed both); RLS is verified by `psql`, not by an automated harness that does not exist.

**Type consistency:** `createStore(client, {userId, businessName, displayName})` → `CreateStoreResult {store?, error?, status?}`, used identically in Task 3 and Task 4. `resolveBuyerContext(client, admin, userId)` → `BuyerContext {isBuyer, buyerAccounts, buyerBrandIds, organization, store}`, used identically in Task 5. `Store` / `StoreUser` defined in Task 2 and imported by Tasks 3 and 5. `locals.store` declared in Task 2, assigned in Task 5, read in Tasks 6, 8, 9.

**Known gaps, stated rather than hidden:**

- Task 9 Step 2 cannot show final code for `/account/+page.svelte` because the file was not read during planning. The step instructs the implementer to read it first and match its markup. This is a genuine unknown, not a placeholder for known content.
- The `event.locals.store = null` initialization site in `hooks.server.ts` (Task 5 Step 5) was not located precisely during planning. The step tells the implementer where to look and what to do if it is absent.
- Copy and icon for Tasks 7 and 8 are drafted but require user sign-off, per `CLAUDE.md`'s prohibition on inventing user-facing copy.
