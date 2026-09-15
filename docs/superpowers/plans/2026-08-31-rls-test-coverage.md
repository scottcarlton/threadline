# RLS Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, with automated tests against a live local Postgres, that the RLS-enabled tables documented in the permissions implementation map enforce their access contract, for every role and both federation directions. This does not cover every RLS-enabled table in the schema: 12 tables have RLS enabled but no entry in the permissions map (6 of those are deny-all with zero policies and are untested here), and `member_territories` and `order_views` cannot be probed with the id-based visibility helpers this suite uses. See the amended permissions map's "Undocumented RLS-enabled tables" section for the full list.

**Architecture:** A separate vitest project (`bun run test:rls`) that runs against local Supabase. A namespaced fixture creates its own orgs, users, connections, and data alongside whatever is already in the local DB, then tears itself down. Tests sign in as real auth users with the anon key and assert what each persona can read and write. The service-role client is used only to seed, inspect ground truth, and clean up. No mocks anywhere in this suite.

**Tech Stack:** vitest 4, `@supabase/supabase-js` 2, local Supabase CLI stack (API `127.0.0.1:54321`, DB `127.0.0.1:54322`), bun.

**Spec:** `docs/brd/permissions-implementation-map.md`. §A.2 (helper index), §A.3 (per-table contract), §A.6 (federation direction cheat-sheet). Every assertion in this plan traces to a row in §A.3. Supporting: `docs/brd/roles-permissions.md`.

**Branch:** `test/rls-test-coverage`, worktree `.worktrees/rls-test-coverage`.

## Global Constraints

- Package manager is `bun`. Never `npm` or `yarn`. `bunx`, not `npx`.
- Tests run against **local** Supabase only. The env module hard-fails if `PUBLIC_SUPABASE_URL` is not `127.0.0.1` or `localhost`. Never point this suite at a remote project.
- `bun run test:run` (the existing 94-file unit suite) must stay hermetic and fast. RLS tests live outside `src/**` and run under a separate config so they never join that run.
- `bun run check` must stay at 0 errors after every task.
- Fixture data is namespaced. All fixture auth users use the email domain `rls-test.threadline.local`. All fixture rows use hardcoded UUIDs from the `RLS_IDS` constant block. Teardown deletes exactly those.
- The fixture does **not** run `supabase db reset`. Developers keep their demo seed data. The fixture coexists with it.
- No em dashes in any file this plan creates, including comments and commit messages.
- When a test fails, do **not** edit the RLS policy to make it pass. See "The core loop" below.

## The core loop (read this before Phase 3)

The policies already exist. These tests are characterization tests, so the normal TDD "write a failing test first" ritual does not apply. The loop is:

1. Read the row for the table in `docs/brd/permissions-implementation-map.md` §A.3.
2. Write the assertion that encodes that row.
3. Run it.
4. **If it passes:** commit.
5. **If it fails:** you have found either a wrong expectation or a real RLS bug. Determine which by reading the actual policy in `supabase/migrations/`. Then:
   - Expectation wrong, map correct → fix the test.
   - Expectation correct, map wrong → fix the test **and** the map, in the same commit.
   - Expectation correct, map correct, **policy wrong** → this is a security finding. Do **not** change the policy in this plan's branch. Mark the test `it.fails(...)` with a comment linking to a new Linear ticket, commit, and report the finding to the user immediately. Policy fixes ship as their own PR with their own review.

Rule 5c is the entire point of this work. Resist the urge to "fix" a policy so a test goes green.

---

## File Structure

**Created:**

| Path                                    | Responsibility                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest.rls.config.ts`                  | Separate vitest project: includes only `tests/rls/**`, serial execution, long timeout                                                   |
| `tests/rls/setup/env.ts`                | Resolves and validates local Supabase credentials; localhost guard; fixture constants                                                   |
| `tests/rls/setup/clients.ts`            | `adminClient()`, `anonClient()`, `clientFor(email)` with per-run session cache                                                          |
| `tests/rls/setup/assert.ts`             | `visibleIds`, `expectVisible`, `expectHidden`, `expectInsertDenied`, `expectInsertAllowed`, `expectUpdateDenied`, `expectUpdateAllowed` |
| `tests/rls/setup/ids.ts`                | `RLS_IDS`: every hardcoded fixture UUID, one place                                                                                      |
| `tests/rls/setup/fixture.ts`            | `seedRlsFixture()` / `teardownRlsFixture()` / `loadPersonaIds()`; builds orgs, users, memberships, connections, data                    |
| `tests/rls/setup/global.ts`             | vitest `globalSetup`: teardown-then-seed, and teardown after the run                                                                    |
| `tests/rls/own-org.test.ts`             | Phase 3: cross-org isolation sweep                                                                                                      |
| `tests/rls/federation-implicit.test.ts` | Phase 4: `get_connected_org_ids()` tables                                                                                               |
| `tests/rls/federation-explicit.test.ts` | Phase 5: `federated_*_links` tables and the auto-federation trigger                                                                     |
| `tests/rls/roles.test.ts`               | Phase 6: role gradient and `member_brand_access` scoping                                                                                |
| `tests/rls/buyer.test.ts`               | Phase 7: buyer portal surface                                                                                                           |
| `tests/rls/public-token.test.ts`        | Phase 8: tables with `USING (true)` SELECT                                                                                              |
| `tests/rls/storage.test.ts`             | Phase 9: storage bucket policies                                                                                                        |
| `tests/rls/admin-bypass.test.ts`        | Phase 11: `supabaseAdmin` call-site inventory guard                                                                                     |

**Modified:**

| Path                       | Change                             |
| -------------------------- | ---------------------------------- |
| `package.json`             | Phase 1: add the `test:rls` script |
| `.github/workflows/ci.yml` | Phase 10: add an `rls` job         |

**Why `tests/` and not colocated `src/**/\*.test.ts`:** CLAUDE.md's colocation rule is about unit tests for a module. These tests have no module to sit next to; they test the database. Keeping them outside `src/\*\*`is also what keeps them out of the`vitest.config.ts` include glob, which is a hard requirement.

**Not reused:** `src/lib/test-helpers/federation-fixtures.ts` exists and has a similar persona vocabulary, but its IDs are strings like `'boa-org-001'`, not UUIDs, and its factories feed a mocked Supabase client. It cannot address a live database. Leave it alone.

## Fixture topology

Four orgs, nine users. Every negative case in the plan has a home here.

```
RLS Brand A (brand org)                RLS Rep A (rep org)
  brand-a-admin   admin                  rep-a-admin   admin, manages_others
  brand-a-sales   sales                  rep-a-sales   sales, manager = rep-a-admin
  brand-a-member  member  --+
  brand-a-guest   guest     |            connection: Rep A <-> Brand A, status active
  brands: A1, A2            |
  member_brand_access ------+ (member scoped to A1 only)
  accounts: accountBrandA (buyer attached)
  products: productA1 (on brand A1)

RLS Brand B (brand org)                RLS Rep B (rep org)
  brand-b-admin   admin                  rep-b-admin   admin
  brands: B1                             accounts: accountRepA (rep-owned)
  no connection to Rep A                 connection: Rep B <-> Brand A, status pending

buyer  -- account_users on accountBrandA, account_brand_access to brand A1
anon   -- no session
```

Key negatives this topology buys you:

- Rep A sees Brand A's products and accounts. Rep A sees **nothing** of Brand B. Proves federation is connection-scoped, not "any brand org".
- Rep B has a **pending** connection to Brand A. Proves federation is `status = 'active'`-scoped, not merely "a row exists".
- Brand A does **not** see an unfederated Rep A account. Proves the accounts asymmetry in §A.3.
- `brand-a-member` is scoped to brand A1 via `member_brand_access`. Proves `get_user_brand_ids` narrowing.
- `rep-a-sales` reports to `rep-a-admin`. Proves the `get_managed_profile_ids` rollup.

## Schema facts the implementer must not rediscover

Verified against the live local database on 2026-08-31:

- Inserting an `organizations` row fires five AFTER INSERT triggers: `auto_create_self_brand`, `seed_org_seasons`, `seed_org_sources`, `seed_org_territories`, and `trg_create_connection_invite`. The fixture therefore never assumes an org's brand, season, source, or territory list is empty. It always references rows by the explicit UUIDs it inserted.
- Inserting an `orders` row fires `set_order_number` (BEFORE), then `federate_new_order` and `orders_audit_insert` (AFTER). The Rep A order against brand A1 auto-creates `federated_order_links` and `federated_account_links` rows. Phase 5 asserts that rather than seeding those links by hand.
- `order_lines.line_total` is a generated column. Never send a value for it.
- Required columns with no default: `organizations(name, slug)`, `organization_members(organization_id, profile_id)`, `brands(organization_id, name)`, `accounts(organization_id, business_name)`, `products(organization_id, brand_id, style_number, name)`, `orders(organization_id, brand_id, created_by)`, `order_lines(order_id)`, `org_connections(rep_org_id, brand_org_id)`, `account_users(account_id, profile_id)`, `account_brand_access(account_id, brand_id, organization_id)`.
- `organization_members` has a BEFORE INSERT trigger `trg_validate_org_member_manager` that rejects cross-org and self-referential `manager_id`. Insert the manager's member row first, then the report's.
- Most FKs to `organizations` are `ON DELETE CASCADE`. Four are `NO ACTION` and must be deleted first: `federated_order_links`, `federated_account_links`, `order_comments.source_org_id`, `email_intakes.organization_id`.
- `user_role` enum values are `admin`, `owner`, `member`, `sales`, `guest`.
- Local auth users can be created with a password via `auth.admin.createUser`, so tests sign in with `signInWithPassword`. No OTP or OAuth is involved.

---

## Phase 1: Harness

Deliverable: `bun run test:rls` runs, connects to local Supabase, and one real assertion passes.

### Task 1.1: Config, env resolution, and localhost guard

**Files:**

- Create: `vitest.rls.config.ts`
- Create: `tests/rls/setup/env.ts`
- Create: `tests/rls/setup/global.ts` (placeholder, replaced in Task 2.3)
- Modify: `package.json` (scripts block)
- Test: `tests/rls/smoke.test.ts` (temporary, deleted in Task 1.3)

**Interfaces:**

- Produces from `tests/rls/setup/env.ts`: `SUPABASE_URL: string`, `ANON_KEY: string`, `SERVICE_ROLE_KEY: string`, `FIXTURE_EMAIL_DOMAIN: string`, `FIXTURE_PASSWORD: string`, `fixtureEmail(handle: string): string`.

- [ ] **Step 1: Write `tests/rls/setup/env.ts`**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env parser. The RLS suite runs under plain vitest with no
 * SvelteKit env plugin, so $env/static/* is unavailable and we read the
 * file directly. No dependency added for this.
 */
function parseEnvFile(path: string): Record<string, string> {
	const out: Record<string, string> = {};
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		return out;
	}
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		const quoted =
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"));
		if (quoted) value = value.slice(1, -1);
		out[key] = value;
	}
	return out;
}

const fileEnv = parseEnvFile(resolve(process.cwd(), '.env'));

function required(key: string): string {
	const value = process.env[key] ?? fileEnv[key];
	if (!value) {
		throw new Error(`RLS tests: missing ${key}. Set it in .env or the environment.`);
	}
	return value;
}

export const SUPABASE_URL = required('PUBLIC_SUPABASE_URL');
export const ANON_KEY = required('PUBLIC_SUPABASE_ANON_KEY');
export const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');

const host = new URL(SUPABASE_URL).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
	throw new Error(
		`RLS tests refuse to run against ${SUPABASE_URL}. ` +
			'This suite creates and deletes auth users and org data. Local Supabase only.'
	);
}

/** All fixture auth users live on this domain so teardown can find them. */
export const FIXTURE_EMAIL_DOMAIN = 'rls-test.threadline.local';
export const FIXTURE_PASSWORD = 'rls-test-pw!';

export function fixtureEmail(handle: string): string {
	return `${handle}@${FIXTURE_EMAIL_DOMAIN}`;
}
```

- [ ] **Step 2: Write `vitest.rls.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/rls/**/*.test.ts'],
		environment: 'node',
		globals: true,
		// One shared fixture in one database. Parallel files would race.
		fileParallelism: false,
		sequence: { concurrent: false },
		testTimeout: 30_000,
		hookTimeout: 120_000,
		globalSetup: ['tests/rls/setup/global.ts']
	}
});
```

- [ ] **Step 3: Add the script to `package.json`**

Insert directly after the existing `"test:run": "vitest run",` line in the `scripts` block:

```json
		"test:rls": "vitest run --config vitest.rls.config.ts",
```

- [ ] **Step 4: Write the placeholder globalSetup**

Create `tests/rls/setup/global.ts`:

```ts
export async function setup(): Promise<void> {
	// Replaced in Task 2.3 with fixture seeding.
}

export async function teardown(): Promise<void> {
	// Replaced in Task 2.3 with fixture teardown.
}
```

- [ ] **Step 5: Write a temporary smoke test**

Create `tests/rls/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SUPABASE_URL } from './setup/env.js';

describe('rls harness', () => {
	it('resolves a local Supabase URL', () => {
		expect(new URL(SUPABASE_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
	});
});
```

- [ ] **Step 6: Run it**

Run: `bun run test:rls`
Expected: 1 passed. If it throws the localhost guard error, your `.env` points at a remote project. Fix `.env` before continuing. Do not weaken the guard.

- [ ] **Step 7: Confirm the unit suite is unaffected**

Run: `bun run test:run`
Expected: the existing suite passes and does not pick up `tests/rls/**`.

- [ ] **Step 8: Commit**

```bash
git add vitest.rls.config.ts tests/rls package.json
git commit -m "test: add RLS test harness config and env resolution"
```

### Task 1.2: Client factory

**Files:**

- Create: `tests/rls/setup/clients.ts`
- Test: `tests/rls/smoke.test.ts` (extended)

**Interfaces:**

- Consumes: `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `FIXTURE_PASSWORD` from `./env.js`.
- Produces: `adminClient(): SupabaseClient`, `anonClient(): SupabaseClient`, `clientFor(email: string): Promise<SupabaseClient>`, `resetClientCache(): void`.

- [ ] **Step 1: Write `tests/rls/setup/clients.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ANON_KEY, FIXTURE_PASSWORD, SERVICE_ROLE_KEY, SUPABASE_URL } from './env.js';

const AUTH_OPTS = { auth: { autoRefreshToken: false, persistSession: false } };

/** Service role. Bypasses RLS. Seeding, ground truth, and teardown only. */
export function adminClient(): SupabaseClient {
	return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, AUTH_OPTS);
}

/** Anon key, no session. Represents a logged-out visitor. */
export function anonClient(): SupabaseClient {
	return createClient(SUPABASE_URL, ANON_KEY, AUTH_OPTS);
}

const cache = new Map<string, SupabaseClient>();

/**
 * Anon-key client carrying a real session for `email`. This is the only
 * client shape that exercises RLS the way the app does.
 */
export async function clientFor(email: string): Promise<SupabaseClient> {
	const cached = cache.get(email);
	if (cached) return cached;
	const client = anonClient();
	const { error } = await client.auth.signInWithPassword({
		email,
		password: FIXTURE_PASSWORD
	});
	if (error) {
		throw new Error(`RLS tests: sign-in failed for ${email}: ${error.message}`);
	}
	cache.set(email, client);
	return client;
}

export function resetClientCache(): void {
	cache.clear();
}
```

- [ ] **Step 2: Extend the smoke test**

Replace the whole body of `tests/rls/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SUPABASE_URL } from './setup/env.js';
import { adminClient, anonClient } from './setup/clients.js';

describe('rls harness', () => {
	it('resolves a local Supabase URL', () => {
		expect(new URL(SUPABASE_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
	});

	it('service role reads organizations', async () => {
		const { error } = await adminClient().from('organizations').select('id').limit(1);
		expect(error).toBeNull();
	});

	it('anon reads no organizations', async () => {
		const { data, error } = await anonClient().from('organizations').select('id').limit(1);
		expect(error).toBeNull();
		expect(data ?? []).toEqual([]);
	});
});
```

- [ ] **Step 3: Run it**

Run: `bun run test:rls`
Expected: 3 passed. The third is the first real RLS assertion in the repo: `organizations` has no anon-readable policy, so an unauthenticated select returns zero rows rather than an error.

- [ ] **Step 4: Commit**

```bash
git add tests/rls
git commit -m "test: add RLS client factory and anon isolation smoke test"
```

### Task 1.3: Assertion helpers

**Files:**

- Create: `tests/rls/setup/assert.ts`
- Delete: `tests/rls/smoke.test.ts`

**Interfaces:**

- Produces: `visibleIds(client, table, candidateIds): Promise<string[]>`, `expectVisible(client, table, id): Promise<void>`, `expectHidden(client, table, id): Promise<void>`, `expectInsertDenied(client, table, row): Promise<void>`, `expectInsertAllowed(client, table, row): Promise<string>`, `expectUpdateDenied(client, table, id, patch): Promise<void>`, `expectUpdateAllowed(client, table, id, patch): Promise<void>`.

- [ ] **Step 1: Write `tests/rls/setup/assert.ts`**

```ts
import { expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Which of `candidateIds` this client can see in `table`.
 *
 * A SELECT blocked by RLS returns zero rows, not an error. Any error here
 * is a genuine problem (missing table, bad column, stale PostgREST schema
 * cache) and is rethrown rather than silently read as "not visible".
 */
export async function visibleIds(
	client: SupabaseClient,
	table: string,
	candidateIds: string[]
): Promise<string[]> {
	const { data, error } = await client.from(table).select('id').in('id', candidateIds);
	if (error) {
		throw new Error(`${table}: unexpected select error ${error.code}: ${error.message}`);
	}
	return (data ?? []).map((row) => (row as { id: string }).id);
}

export async function expectVisible(
	client: SupabaseClient,
	table: string,
	id: string
): Promise<void> {
	const seen = await visibleIds(client, table, [id]);
	expect(seen, `${table}:${id} should be visible`).toEqual([id]);
}

export async function expectHidden(
	client: SupabaseClient,
	table: string,
	id: string
): Promise<void> {
	const seen = await visibleIds(client, table, [id]);
	expect(seen, `${table}:${id} should be hidden`).toEqual([]);
}

/** An INSERT blocked by a WITH CHECK clause raises Postgres error 42501. */
export async function expectInsertDenied(
	client: SupabaseClient,
	table: string,
	row: Record<string, unknown>
): Promise<void> {
	const { error } = await client.from(table).insert(row);
	expect(error?.code, `${table} insert should be denied by RLS`).toBe('42501');
}

/** Returns the new row id so callers can clean up or chain assertions. */
export async function expectInsertAllowed(
	client: SupabaseClient,
	table: string,
	row: Record<string, unknown>
): Promise<string> {
	const { data, error } = await client.from(table).insert(row).select('id').single();
	expect(error, `${table} insert should be allowed, got ${error?.message}`).toBeNull();
	return (data as { id: string }).id;
}

/**
 * An UPDATE can be blocked two ways: the USING clause hides the row (no
 * error, zero rows affected) or the WITH CHECK clause rejects the new
 * values (42501). Both count as denied.
 */
export async function expectUpdateDenied(
	client: SupabaseClient,
	table: string,
	id: string,
	patch: Record<string, unknown>
): Promise<void> {
	const { data, error } = await client.from(table).update(patch).eq('id', id).select('id');
	if (error) {
		expect(error.code, `${table}:${id} update should be denied by RLS`).toBe('42501');
		return;
	}
	expect(data ?? [], `${table}:${id} update should affect no rows`).toEqual([]);
}

export async function expectUpdateAllowed(
	client: SupabaseClient,
	table: string,
	id: string,
	patch: Record<string, unknown>
): Promise<void> {
	const { data, error } = await client.from(table).update(patch).eq('id', id).select('id');
	expect(error, `${table}:${id} update should be allowed`).toBeNull();
	expect(data ?? [], `${table}:${id} update should affect one row`).toEqual([{ id }]);
}
```

- [ ] **Step 2: Delete the smoke test**

```bash
rm tests/rls/smoke.test.ts
```

Its three assertions are superseded: the anon-isolation case is re-asserted in Phase 3 against real fixture rows.

- [ ] **Step 3: Typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A tests/rls
git commit -m "test: add RLS assertion helpers"
```

---

## Phase 2: Fixture

Deliverable: `seedRlsFixture()` builds the topology above and `teardownRlsFixture()` removes every trace of it, verified by a round-trip test.

### Task 2.1: ID constants

**Files:**

- Create: `tests/rls/setup/ids.ts`

**Interfaces:**

- Produces: `RLS_IDS` (frozen record of UUID string constants), `RLS_ORG_IDS: string[]` (the four org UUIDs, used by teardown).

- [ ] **Step 1: Write `tests/rls/setup/ids.ts`**

```ts
/**
 * Every fixture row gets an explicit UUID so teardown is exact rather than
 * heuristic. Auth user ids are NOT here: GoTrue assigns them at creation
 * time and they are captured into PERSONA_IDS. Auth users are found for
 * teardown by their email domain instead.
 *
 * The 0f5 prefix is arbitrary and exists only to make fixture rows obvious
 * when you are staring at the local database.
 */
const P = '0f500000-0000-4000-8000-';

export const RLS_IDS = {
	orgBrandA: `${P}000000000001`,
	orgBrandB: `${P}000000000002`,
	orgRepA: `${P}000000000003`,
	orgRepB: `${P}000000000004`,

	brandA1: `${P}000000000101`,
	brandA2: `${P}000000000102`,
	brandB1: `${P}000000000103`,
	brandRepAOwn: `${P}000000000104`,

	connActive: `${P}000000000201`,
	connPending: `${P}000000000202`,

	accountBrandA: `${P}000000000301`,
	accountRepA: `${P}000000000302`,
	accountBrandB: `${P}000000000303`,

	productA1: `${P}000000000401`,
	productB1: `${P}000000000402`,
	variantA1: `${P}000000000403`,

	orderRepAOnBrandA: `${P}000000000501`,
	orderBrandAInternal: `${P}000000000502`,
	orderRepBOnBrandB: `${P}000000000503`,

	orderLineRepAOnBrandA: `${P}000000000601`
} as const;

export const RLS_ORG_IDS: string[] = [
	RLS_IDS.orgBrandA,
	RLS_IDS.orgBrandB,
	RLS_IDS.orgRepA,
	RLS_IDS.orgRepB
];
```

- [ ] **Step 2: Typecheck and commit**

```bash
bun run check
git add tests/rls/setup/ids.ts
git commit -m "test: add RLS fixture id constants"
```

### Task 2.2: Fixture seed, teardown, and persona id loading

**Files:**

- Create: `tests/rls/setup/fixture.ts`

**Interfaces:**

- Consumes: `adminClient`, `clientFor`, `resetClientCache` from `./clients.js`; `FIXTURE_EMAIL_DOMAIN`, `FIXTURE_PASSWORD`, `fixtureEmail` from `./env.js`; `RLS_IDS`, `RLS_ORG_IDS` from `./ids.js`.
- Produces:
  - `type RlsPersona = 'brandAAdmin' | 'brandASales' | 'brandAMember' | 'brandAGuest' | 'brandBAdmin' | 'repAAdmin' | 'repASales' | 'repBAdmin' | 'buyer'`
  - `const PERSONA_EMAILS: Record<RlsPersona, string>`
  - `const PERSONA_IDS: Partial<Record<RlsPersona, string>>` (profile ids)
  - `const MEMBER_ROW_IDS: Partial<Record<RlsPersona, string>>` (`organization_members.id`)
  - `seedRlsFixture(): Promise<void>`
  - `teardownRlsFixture(): Promise<void>`
  - `loadPersonaIds(): Promise<void>` (repopulates both id maps from the database; every spec calls this in `beforeAll`)
  - `personaClient(persona: RlsPersona): Promise<SupabaseClient>`

`loadPersonaIds()` exists because vitest runs `globalSetup` in a different module context from the test workers, so module-level state written during seeding does not reach the specs. Reading the ids back from the database is the reliable path and costs one query per file.

- [ ] **Step 1: Write `tests/rls/setup/fixture.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, clientFor, resetClientCache } from './clients.js';
import { FIXTURE_EMAIL_DOMAIN, FIXTURE_PASSWORD, fixtureEmail } from './env.js';
import { RLS_IDS, RLS_ORG_IDS } from './ids.js';

export type RlsPersona =
	| 'brandAAdmin'
	| 'brandASales'
	| 'brandAMember'
	| 'brandAGuest'
	| 'brandBAdmin'
	| 'repAAdmin'
	| 'repASales'
	| 'repBAdmin'
	| 'buyer';

export const PERSONA_EMAILS: Record<RlsPersona, string> = {
	brandAAdmin: fixtureEmail('brand-a-admin'),
	brandASales: fixtureEmail('brand-a-sales'),
	brandAMember: fixtureEmail('brand-a-member'),
	brandAGuest: fixtureEmail('brand-a-guest'),
	brandBAdmin: fixtureEmail('brand-b-admin'),
	repAAdmin: fixtureEmail('rep-a-admin'),
	repASales: fixtureEmail('rep-a-sales'),
	repBAdmin: fixtureEmail('rep-b-admin'),
	buyer: fixtureEmail('buyer')
};

const PERSONA_BY_EMAIL = new Map<string, RlsPersona>(
	(Object.keys(PERSONA_EMAILS) as RlsPersona[]).map((p) => [PERSONA_EMAILS[p], p])
);

/** profile_id per persona. Populated by seedRlsFixture and loadPersonaIds. */
export const PERSONA_IDS: Partial<Record<RlsPersona, string>> = {};

/** organization_members.id per persona. Needed for member_brand_access. */
export const MEMBER_ROW_IDS: Partial<Record<RlsPersona, string>> = {};

export async function personaClient(persona: RlsPersona): Promise<SupabaseClient> {
	return clientFor(PERSONA_EMAILS[persona]);
}

function must<T>(label: string, result: { data: T | null; error: { message: string } | null }): T {
	if (result.error || result.data == null) {
		throw new Error(`RLS fixture: ${label} failed: ${result.error?.message ?? 'no data'}`);
	}
	return result.data;
}

function check(label: string, error: { message: string } | null): void {
	if (error) throw new Error(`RLS fixture: ${label} failed: ${error.message}`);
}

async function seedUsers(admin: SupabaseClient): Promise<void> {
	for (const persona of Object.keys(PERSONA_EMAILS) as RlsPersona[]) {
		const email = PERSONA_EMAILS[persona];
		const { data, error } = await admin.auth.admin.createUser({
			email,
			password: FIXTURE_PASSWORD,
			email_confirm: true,
			user_metadata: { display_name: persona }
		});
		if (error || !data.user) {
			throw new Error(`RLS fixture: createUser ${email} failed: ${error?.message}`);
		}
		PERSONA_IDS[persona] = data.user.id;
	}
}

async function seedOrgs(admin: SupabaseClient): Promise<void> {
	check(
		'organizations insert',
		(
			await admin.from('organizations').insert([
				{ id: RLS_IDS.orgBrandA, name: 'RLS Brand A', slug: 'rls-brand-a', org_type: 'brand' },
				{ id: RLS_IDS.orgBrandB, name: 'RLS Brand B', slug: 'rls-brand-b', org_type: 'brand' },
				{ id: RLS_IDS.orgRepA, name: 'RLS Rep A', slug: 'rls-rep-a', org_type: 'rep' },
				{ id: RLS_IDS.orgRepB, name: 'RLS Rep B', slug: 'rls-rep-b', org_type: 'rep' }
			])
		).error
	);
}

async function seedMemberships(admin: SupabaseClient): Promise<void> {
	// Managers first: trg_validate_org_member_manager needs the manager row
	// to already exist and to belong to the same org.
	const managers: Array<{ persona: RlsPersona; org: string; role: string }> = [
		{ persona: 'brandAAdmin', org: RLS_IDS.orgBrandA, role: 'admin' },
		{ persona: 'brandBAdmin', org: RLS_IDS.orgBrandB, role: 'admin' },
		{ persona: 'repAAdmin', org: RLS_IDS.orgRepA, role: 'admin' },
		{ persona: 'repBAdmin', org: RLS_IDS.orgRepB, role: 'admin' }
	];
	for (const m of managers) {
		const row = must(
			`membership ${m.persona}`,
			await admin
				.from('organization_members')
				.insert({
					organization_id: m.org,
					profile_id: PERSONA_IDS[m.persona]!,
					role: m.role,
					manages_others: true,
					accepted_at: new Date().toISOString()
				})
				.select('id')
				.single()
		);
		MEMBER_ROW_IDS[m.persona] = (row as { id: string }).id;
	}

	const reports: Array<{
		persona: RlsPersona;
		org: string;
		role: string;
		manager: RlsPersona | null;
	}> = [
		{ persona: 'brandASales', org: RLS_IDS.orgBrandA, role: 'sales', manager: null },
		{ persona: 'brandAMember', org: RLS_IDS.orgBrandA, role: 'member', manager: null },
		{ persona: 'brandAGuest', org: RLS_IDS.orgBrandA, role: 'guest', manager: null },
		{ persona: 'repASales', org: RLS_IDS.orgRepA, role: 'sales', manager: 'repAAdmin' }
	];
	for (const r of reports) {
		const row = must(
			`membership ${r.persona}`,
			await admin
				.from('organization_members')
				.insert({
					organization_id: r.org,
					profile_id: PERSONA_IDS[r.persona]!,
					role: r.role,
					manager_id: r.manager ? MEMBER_ROW_IDS[r.manager]! : null,
					accepted_at: new Date().toISOString()
				})
				.select('id')
				.single()
		);
		MEMBER_ROW_IDS[r.persona] = (row as { id: string }).id;
	}
}

async function seedBrandsAndProducts(admin: SupabaseClient): Promise<void> {
	check(
		'brands insert',
		(
			await admin.from('brands').insert([
				{
					id: RLS_IDS.brandA1,
					organization_id: RLS_IDS.orgBrandA,
					name: 'RLS Brand A One',
					is_active: true
				},
				{
					id: RLS_IDS.brandA2,
					organization_id: RLS_IDS.orgBrandA,
					name: 'RLS Brand A Two',
					is_active: true
				},
				{
					id: RLS_IDS.brandB1,
					organization_id: RLS_IDS.orgBrandB,
					name: 'RLS Brand B One',
					is_active: true
				},
				{
					id: RLS_IDS.brandRepAOwn,
					organization_id: RLS_IDS.orgRepA,
					name: 'RLS Rep A In-House',
					is_active: true
				}
			])
		).error
	);

	// brand-a-member is scoped to A1 only. With no member_brand_access rows
	// at all the helper grants every brand, so this single row is what makes
	// A2 invisible to that persona.
	check(
		'member_brand_access insert',
		(
			await admin.from('member_brand_access').insert({
				member_id: MEMBER_ROW_IDS.brandAMember!,
				brand_id: RLS_IDS.brandA1,
				granted_by: PERSONA_IDS.brandAAdmin!
			})
		).error
	);

	check(
		'products insert',
		(
			await admin.from('products').insert([
				{
					id: RLS_IDS.productA1,
					organization_id: RLS_IDS.orgBrandA,
					brand_id: RLS_IDS.brandA1,
					name: 'RLS Product A1',
					style_number: 'RLS-A1',
					is_active: true
				},
				{
					id: RLS_IDS.productB1,
					organization_id: RLS_IDS.orgBrandB,
					brand_id: RLS_IDS.brandB1,
					name: 'RLS Product B1',
					style_number: 'RLS-B1',
					is_active: true
				}
			])
		).error
	);

	check(
		'product_variants insert',
		(
			await admin.from('product_variants').insert({
				id: RLS_IDS.variantA1,
				product_id: RLS_IDS.productA1,
				color: 'Black',
				size: 'M'
			})
		).error
	);
}

async function seedAccounts(admin: SupabaseClient): Promise<void> {
	check(
		'accounts insert',
		(
			await admin.from('accounts').insert([
				{
					id: RLS_IDS.accountBrandA,
					organization_id: RLS_IDS.orgBrandA,
					business_name: 'RLS Account Brand A'
				},
				{
					id: RLS_IDS.accountRepA,
					organization_id: RLS_IDS.orgRepA,
					business_name: 'RLS Account Rep A'
				},
				{
					id: RLS_IDS.accountBrandB,
					organization_id: RLS_IDS.orgBrandB,
					business_name: 'RLS Account Brand B'
				}
			])
		).error
	);

	check(
		'account_brand_access insert',
		(
			await admin.from('account_brand_access').insert({
				account_id: RLS_IDS.accountBrandA,
				brand_id: RLS_IDS.brandA1,
				organization_id: RLS_IDS.orgBrandA
			})
		).error
	);

	check(
		'account_users insert',
		(
			await admin.from('account_users').insert({
				account_id: RLS_IDS.accountBrandA,
				profile_id: PERSONA_IDS.buyer!,
				role: 'admin',
				accepted_at: new Date().toISOString()
			})
		).error
	);
}

async function seedConnections(admin: SupabaseClient): Promise<void> {
	check(
		'org_connections insert',
		(
			await admin.from('org_connections').insert([
				{
					id: RLS_IDS.connActive,
					rep_org_id: RLS_IDS.orgRepA,
					brand_org_id: RLS_IDS.orgBrandA,
					status: 'active',
					commission_rate: 12,
					connected_at: new Date().toISOString(),
					requested_by: PERSONA_IDS.repAAdmin!,
					approved_by: PERSONA_IDS.brandAAdmin!
				},
				{
					id: RLS_IDS.connPending,
					rep_org_id: RLS_IDS.orgRepB,
					brand_org_id: RLS_IDS.orgBrandA,
					status: 'pending',
					requested_by: PERSONA_IDS.repBAdmin!
				}
			])
		).error
	);
}

async function seedOrders(admin: SupabaseClient): Promise<void> {
	// The first order fires federate_new_order and creates the federated_*
	// links that Phase 5 asserts on. Do not seed those links by hand.
	check(
		'orders insert',
		(
			await admin.from('orders').insert([
				{
					id: RLS_IDS.orderRepAOnBrandA,
					organization_id: RLS_IDS.orgRepA,
					brand_id: RLS_IDS.brandA1,
					account_id: RLS_IDS.accountRepA,
					created_by: PERSONA_IDS.repAAdmin!,
					status: 'submitted'
				},
				{
					id: RLS_IDS.orderBrandAInternal,
					organization_id: RLS_IDS.orgBrandA,
					brand_id: RLS_IDS.brandA2,
					account_id: RLS_IDS.accountBrandA,
					created_by: PERSONA_IDS.brandAAdmin!,
					status: 'draft'
				},
				{
					id: RLS_IDS.orderRepBOnBrandB,
					organization_id: RLS_IDS.orgRepB,
					brand_id: RLS_IDS.brandB1,
					created_by: PERSONA_IDS.repBAdmin!,
					status: 'draft'
				}
			])
		).error
	);

	// line_total is a generated column. Never send it.
	check(
		'order_lines insert',
		(
			await admin.from('order_lines').insert({
				id: RLS_IDS.orderLineRepAOnBrandA,
				order_id: RLS_IDS.orderRepAOnBrandA,
				product_id: RLS_IDS.productA1,
				variant_id: RLS_IDS.variantA1,
				style_number: 'RLS-A1',
				color: 'Black',
				size: 'M',
				qty: 3,
				unit_price: 100
			})
		).error
	);
}

export async function seedRlsFixture(): Promise<void> {
	const admin = adminClient();
	await seedUsers(admin);
	await seedOrgs(admin);
	await seedMemberships(admin);
	await seedBrandsAndProducts(admin);
	await seedAccounts(admin);
	await seedConnections(admin);
	await seedOrders(admin);
}

/**
 * Repopulates PERSONA_IDS and MEMBER_ROW_IDS from the database. Vitest runs
 * globalSetup in a separate module context from the test workers, so module
 * state written during seeding does not reach the specs. Every spec file
 * calls this in beforeAll.
 */
export async function loadPersonaIds(): Promise<void> {
	const admin = adminClient();

	let page = 1;
	for (;;) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
		if (error) throw new Error(`RLS fixture: listUsers failed: ${error.message}`);
		const users = data?.users ?? [];
		if (users.length === 0) break;
		for (const user of users) {
			const persona = user.email ? PERSONA_BY_EMAIL.get(user.email) : undefined;
			if (persona) PERSONA_IDS[persona] = user.id;
		}
		if (users.length < 200) break;
		page += 1;
	}

	const missing = (Object.keys(PERSONA_EMAILS) as RlsPersona[]).filter((p) => !PERSONA_IDS[p]);
	if (missing.length > 0) {
		throw new Error(`RLS fixture: personas not seeded: ${missing.join(', ')}`);
	}

	const { data: members, error: memberErr } = await admin
		.from('organization_members')
		.select('id, profile_id')
		.in('organization_id', RLS_ORG_IDS);
	if (memberErr) {
		throw new Error(`RLS fixture: member lookup failed: ${memberErr.message}`);
	}
	const personaByProfile = new Map<string, RlsPersona>();
	for (const persona of Object.keys(PERSONA_EMAILS) as RlsPersona[]) {
		const id = PERSONA_IDS[persona];
		if (id) personaByProfile.set(id, persona);
	}
	for (const row of (members ?? []) as Array<{ id: string; profile_id: string }>) {
		const persona = personaByProfile.get(row.profile_id);
		if (persona) MEMBER_ROW_IDS[persona] = row.id;
	}
}

export async function teardownRlsFixture(): Promise<void> {
	const admin = adminClient();
	resetClientCache();

	const orgList = RLS_ORG_IDS.join(',');

	// These FKs to organizations are NO ACTION, so they must go before the
	// orgs. Everything else cascades from organizations.
	await admin
		.from('federated_order_links')
		.delete()
		.or(`source_org_id.in.(${orgList}),target_org_id.in.(${orgList})`);
	await admin
		.from('federated_account_links')
		.delete()
		.or(`source_org_id.in.(${orgList}),target_org_id.in.(${orgList})`);
	await admin.from('order_comments').delete().in('source_org_id', RLS_ORG_IDS);
	await admin.from('email_intakes').delete().in('organization_id', RLS_ORG_IDS);

	await admin.from('organizations').delete().in('id', RLS_ORG_IDS);

	// Auth users are found by email domain, not by id: GoTrue assigns ids.
	let page = 1;
	for (;;) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
		if (error) throw new Error(`RLS teardown: listUsers failed: ${error.message}`);
		const users = data?.users ?? [];
		if (users.length === 0) break;
		for (const user of users) {
			if (user.email?.endsWith(`@${FIXTURE_EMAIL_DOMAIN}`)) {
				await admin.auth.admin.deleteUser(user.id);
			}
		}
		if (users.length < 200) break;
		page += 1;
	}

	for (const persona of Object.keys(PERSONA_EMAILS) as RlsPersona[]) {
		delete PERSONA_IDS[persona];
		delete MEMBER_ROW_IDS[persona];
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/setup/fixture.ts
git commit -m "test: add live RLS fixture seed, teardown, and persona id loading"
```

### Task 2.3: Wire globalSetup and prove the round trip

**Files:**

- Modify: `tests/rls/setup/global.ts`
- Test: `tests/rls/fixture.test.ts`

**Interfaces:**

- Consumes: `seedRlsFixture`, `teardownRlsFixture`, `loadPersonaIds`, `PERSONA_EMAILS`, `PERSONA_IDS`, `personaClient` from `./fixture.js`.

- [ ] **Step 1: Replace `tests/rls/setup/global.ts`**

```ts
import { seedRlsFixture, teardownRlsFixture } from '../setup/fixture.js';

export async function setup(): Promise<void> {
	// Idempotent: clear anything a crashed previous run left behind, then seed.
	await teardownRlsFixture();
	await seedRlsFixture();
}

export async function teardown(): Promise<void> {
	await teardownRlsFixture();
}
```

If the relative import path resolves oddly because `global.ts` already lives in `setup/`, use `'./fixture.js'`. Both files are siblings.

- [ ] **Step 2: Write `tests/rls/fixture.test.ts`**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS, RLS_ORG_IDS } from './setup/ids.js';
import {
	MEMBER_ROW_IDS,
	PERSONA_EMAILS,
	PERSONA_IDS,
	loadPersonaIds,
	personaClient,
	type RlsPersona
} from './setup/fixture.js';

beforeAll(loadPersonaIds);

describe('rls fixture', () => {
	it('seeded all four orgs', async () => {
		const { data } = await adminClient().from('organizations').select('id').in('id', RLS_ORG_IDS);
		expect((data ?? []).length).toBe(4);
	});

	it('seeded the connection pair with the intended statuses', async () => {
		const { data } = await adminClient()
			.from('org_connections')
			.select('id, status')
			.in('id', [RLS_IDS.connActive, RLS_IDS.connPending]);
		const byId = new Map(
			((data ?? []) as Array<{ id: string; status: string }>).map((r) => [r.id, r.status])
		);
		expect(byId.get(RLS_IDS.connActive)).toBe('active');
		expect(byId.get(RLS_IDS.connPending)).toBe('pending');
	});

	it('every persona can sign in', async () => {
		for (const persona of Object.keys(PERSONA_EMAILS) as RlsPersona[]) {
			const client = await personaClient(persona);
			const { data } = await client.auth.getUser();
			expect(data.user?.email, `${persona} session`).toBe(PERSONA_EMAILS[persona]);
		}
	});

	it('loadPersonaIds populates both id maps', () => {
		expect(PERSONA_IDS.repAAdmin).toBeTruthy();
		expect(PERSONA_IDS.buyer).toBeTruthy();
		expect(MEMBER_ROW_IDS.brandAMember).toBeTruthy();
		// The buyer has no organization_members row by design.
		expect(MEMBER_ROW_IDS.buyer).toBeUndefined();
	});
});
```

- [ ] **Step 3: Run it**

Run: `bun run test:rls`
Expected: 4 passed.

- [ ] **Step 4: Verify teardown really cleaned up**

Run:

```bash
docker exec supabase_db_threadline psql -U postgres -d postgres \
  -c "select count(*) from organizations where name like 'RLS %';" \
  -c "select count(*) from auth.users where email like '%@rls-test.threadline.local';"
```

Expected: both counts are 0. If either is nonzero, teardown has a gap. Fix `teardownRlsFixture` before continuing, because every later phase depends on a clean start.

- [ ] **Step 5: Verify the developer's demo data survived**

Run:

```bash
docker exec supabase_db_threadline psql -U postgres -d postgres \
  -c "select count(*) from organizations where name not like 'RLS %';"
```

Expected: the same count as before the test run. The fixture must never disturb demo data.

- [ ] **Step 6: Commit**

```bash
git add tests/rls
git commit -m "test: wire RLS fixture into globalSetup with round-trip verification"
```

---

## Phase 3: Own-org isolation sweep

Deliverable: a table-driven spec proving that a member of one org sees none of another org's rows, across every own-org table in §A.3, plus the anon baseline.

This phase covers the bulk of the 60 tables cheaply. Federation-aware tables are deliberately excluded here and handled in Phases 4 and 5.

### Task 3.1: Cross-org isolation matrix

**Files:**

- Create: `tests/rls/own-org.test.ts`

**Interfaces:**

- Consumes: `personaClient`, `PERSONA_IDS`, `loadPersonaIds` from `./setup/fixture.js`; `RLS_IDS` from `./setup/ids.js`; `adminClient`, `anonClient` from `./setup/clients.js`; `expectHidden`, `expectVisible` from `./setup/assert.js`.

- [ ] **Step 1: Write the spec**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectHidden, expectVisible } from './setup/assert.js';

/**
 * One probe row per own-org table, owned by RLS Rep A. Each probe is
 * inserted with the service-role client, checked, and deleted, so this spec
 * owns its own data and never disturbs the shared fixture.
 *
 * Every table here comes from the "Own-org tables (no federation SELECT)"
 * section of docs/brd/permissions-implementation-map.md A.3.
 */
type Probe = {
	table: string;
	row: () => Record<string, unknown>;
};

let probes: Probe[];

beforeAll(async () => {
	await loadPersonaIds();
	probes = [
		{
			table: 'seasons',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Season' })
		},
		{
			table: 'shows',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Show' })
		},
		{
			table: 'source_types',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Source' })
		},
		{
			table: 'territories',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Territory' })
		},
		{
			table: 'appointments',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				title: 'RLS Probe Appointment',
				created_by: PERSONA_IDS.repAAdmin
			})
		},
		{
			table: 'commission_overrides',
			row: () => ({ organization_id: RLS_IDS.orgRepA, rate: 5 })
		},
		{
			table: 'organization_sales_tax_rates',
			row: () => ({ organization_id: RLS_IDS.orgRepA, rate: 8.875, region: 'NY' })
		},
		{
			table: 'organization_shipping_methods',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Shipping' })
		},
		{
			table: 'discovered_contacts',
			row: () => ({ organization_id: RLS_IDS.orgRepA, email: 'probe@rls-test.threadline.local' })
		},
		{
			table: 'integration_connections',
			row: () => ({ organization_id: RLS_IDS.orgRepA, provider: 'notion' })
		},
		{
			table: 'org_agents',
			row: () => ({ organization_id: RLS_IDS.orgRepA, name: 'RLS Probe Agent' })
		},
		{
			table: 'email_log',
			row: () => ({ organization_id: RLS_IDS.orgRepA, subject: 'RLS Probe Email' })
		},
		{
			table: 'insight_actions',
			row: () => ({ organization_id: RLS_IDS.orgRepA, title: 'RLS Probe Insight' })
		},
		{
			table: 'member_brand_commissions',
			row: () => ({
				organization_id: RLS_IDS.orgRepA,
				brand_id: RLS_IDS.brandRepAOwn,
				rate: 10
			})
		}
	];
});

/**
 * If an insert fails with 42703 (undefined column) or 23502 (not-null
 * violation), the probe columns are wrong. Read the real columns with:
 *   docker exec supabase_db_threadline psql -U postgres -d postgres -c "\\d <table>"
 * and correct the probe. Do not delete the probe to make the suite green.
 */
async function insertProbe(probe: Probe): Promise<string> {
	const { data, error } = await adminClient()
		.from(probe.table)
		.insert(probe.row())
		.select('id')
		.single();
	if (error) {
		throw new Error(
			`probe insert for ${probe.table} failed: ${error.code} ${error.message}. ` +
				'Correct the probe columns against the real schema.'
		);
	}
	return (data as { id: string }).id;
}

describe('own-org isolation', () => {
	it('an outsider org admin sees none of another org rows', async () => {
		const outsider = await personaClient('repBAdmin');
		const owner = await personaClient('repAAdmin');
		for (const probe of probes) {
			const id = await insertProbe(probe);
			try {
				await expectVisible(owner, probe.table, id);
				await expectHidden(outsider, probe.table, id);
			} finally {
				await adminClient().from(probe.table).delete().eq('id', id);
			}
		}
	});

	it('anon sees none of another org rows', async () => {
		const anon = anonClient();
		for (const probe of probes) {
			const id = await insertProbe(probe);
			try {
				await expectHidden(anon, probe.table, id);
			} finally {
				await adminClient().from(probe.table).delete().eq('id', id);
			}
		}
	});

	it('organizations, members, and profiles respect org boundaries', async () => {
		const repA = await personaClient('repAAdmin');
		const repB = await personaClient('repBAdmin');

		await expectVisible(repA, 'organizations', RLS_IDS.orgRepA);
		await expectHidden(repA, 'organizations', RLS_IDS.orgRepB);
		await expectHidden(repB, 'organizations', RLS_IDS.orgRepA);

		const { data: repAMembers } = await repA.from('organization_members').select('organization_id');
		const orgs = new Set(
			((repAMembers ?? []) as Array<{ organization_id: string }>).map((r) => r.organization_id)
		);
		expect(orgs.has(RLS_IDS.orgRepB)).toBe(false);

		// profiles: own row plus org peers only.
		const { data: visibleProfiles } = await repA
			.from('profiles')
			.select('id')
			.in('id', [PERSONA_IDS.repASales!, PERSONA_IDS.repBAdmin!]);
		const seen = ((visibleProfiles ?? []) as Array<{ id: string }>).map((r) => r.id);
		expect(seen).toContain(PERSONA_IDS.repASales);
		expect(seen).not.toContain(PERSONA_IDS.repBAdmin);
	});

	it('per-user tables are scoped to auth.uid()', async () => {
		const repA = await personaClient('repAAdmin');
		const repB = await personaClient('repBAdmin');

		const { data: cart, error: cartErr } = await adminClient()
			.from('cart_items')
			.insert({
				profile_id: PERSONA_IDS.repAAdmin!,
				product_id: RLS_IDS.productA1,
				variant_id: RLS_IDS.variantA1,
				qty: 1
			})
			.select('id')
			.single();
		expect(cartErr).toBeNull();
		const cartId = (cart as { id: string }).id;

		try {
			await expectVisible(repA, 'cart_items', cartId);
			await expectHidden(repB, 'cart_items', cartId);
		} finally {
			await adminClient().from('cart_items').delete().eq('id', cartId);
		}
	});
});
```

- [ ] **Step 2: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/own-org.test.ts`
Expected: 4 passed. Probe inserts failing with 42703 or 23502 are schema mismatches in the probe list: correct the columns using the `\d <table>` command in the comment. A failure where an outsider **can** see a row is a security finding: follow the core loop, rule 5c.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/own-org.test.ts
git commit -m "test: cover own-org RLS isolation across own-org tables"
```

### Task 3.2: Extend the probe list to full §A.3 coverage

**Files:**

- Modify: `tests/rls/own-org.test.ts`

- [ ] **Step 1: Enumerate what is not yet covered**

```bash
grep -rhio "alter table [a-z_.\"]* enable row level security" supabase/migrations \
  | sed -E 's/^alter table //i; s/ enable row level security$//i' | tr -d '"' | tr 'A-Z' 'a-z' | sed 's/^public\.//' | sort -u > /tmp/rls-tables.txt
grep -rho "table: '[a-z_]*'" tests/rls | sed "s/table: '//;s/'//" | sort -u > /tmp/covered.txt
comm -23 /tmp/rls-tables.txt /tmp/covered.txt
```

(The original version of this command only stripped the `alter table ` prefix via `sed 's/.*table //i'`, leaving the ` enable row level security` suffix on every line. Since neither file's table names have that suffix, the two lists could never intersect and `comm -23` returned every table unchanged, including ones already covered. The version above strips the suffix too and normalizes a leading `public.` schema qualifier, which is what actually worked during execution.)

- [ ] **Step 2: Assign each uncovered table to a phase**

Add it to `probes` in this file if §A.3 lists it under "Own-org tables". Otherwise note it for Phase 4 (federation-aware), Phase 5 (explicit federation), Phase 7 (buyer), Phase 8 (public-by-token), or Phase 9 (storage). Record the assignment as a comment at the top of `own-org.test.ts` in a block titled `// Phase assignment for tables not probed here:` so nothing is silently dropped.

- [ ] **Step 3: Run, correct probes, commit**

```bash
bunx vitest run --config vitest.rls.config.ts tests/rls/own-org.test.ts
git add tests/rls/own-org.test.ts
git commit -m "test: extend own-org RLS sweep to all own-org tables"
```

---

## Phase 4: Federation-aware tables

Deliverable: proof that `get_connected_org_ids()` grants exactly the connected-org access described in §A.3, including the accounts asymmetry and the `status = 'active'` gate.

Tables in scope (§A.3 "Federation-aware tables"): `brands`, `brand_assets`, `accounts`, `account_locations`, `account_tags`, `account_tag_assignments`, `account_brand_access`, `account_users`, `brand_expenses`, `expense_receipts`, `products`, `product_variants`, `product_images`.

### Task 4.1: Symmetric federation on brands and products

**Files:**

- Create: `tests/rls/federation-implicit.test.ts`

- [ ] **Step 1: Write the spec**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectHidden, expectVisible } from './setup/assert.js';

beforeAll(loadPersonaIds);

describe('implicit federation via get_connected_org_ids', () => {
	it('a connected rep sees the brand org brands', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'brands', RLS_IDS.brandA1);
		await expectVisible(repA, 'brands', RLS_IDS.brandA2);
	});

	it('a connected rep sees the brand org products and variants', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'products', RLS_IDS.productA1);
		await expectVisible(repA, 'product_variants', RLS_IDS.variantA1);
	});

	it('an unconnected brand org is invisible to the rep', async () => {
		const repA = await personaClient('repAAdmin');
		await expectHidden(repA, 'brands', RLS_IDS.brandB1);
		await expectHidden(repA, 'products', RLS_IDS.productB1);
	});

	it('a pending connection grants nothing', async () => {
		// Rep B has a connection row to Brand A with status pending.
		const repB = await personaClient('repBAdmin');
		await expectHidden(repB, 'brands', RLS_IDS.brandA1);
		await expectHidden(repB, 'products', RLS_IDS.productA1);
	});

	it('federation is not transitive', async () => {
		// Brand B has no connection to Rep A, so nothing of Rep A reaches it
		// through Brand A.
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(brandB, 'brands', RLS_IDS.brandRepAOwn);
		await expectHidden(brandB, 'accounts', RLS_IDS.accountRepA);
	});

	it('a connected rep cannot write the brand org products', async () => {
		const repA = await personaClient('repAAdmin');
		const { data, error } = await repA
			.from('products')
			.update({ name: 'hijacked' })
			.eq('id', RLS_IDS.productA1)
			.select('id');
		if (error) {
			expect(error.code).toBe('42501');
		} else {
			expect(data ?? []).toEqual([]);
		}
	});
});
```

- [ ] **Step 2: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/federation-implicit.test.ts`
Expected: 6 passed. "a pending connection grants nothing" and "federation is not transitive" are the two most likely to surface a real bug. Follow the core loop if either fails.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/federation-implicit.test.ts
git commit -m "test: cover implicit federation RLS for brands and products"
```

### Task 4.2: Accounts asymmetry

**Files:**

- Modify: `tests/rls/federation-implicit.test.ts`

This is the highest-value test in the plan. §A.3 "Accounts federation asymmetry" says: a rep sees a connected brand org's accounts implicitly, but a brand sees a rep's account **only** via an explicit `federated_account_links` row. Getting this backwards leaks a rep's entire account book to every connected brand.

- [ ] **Step 1: Add the import for `adminClient` at the top of the file**

```ts
import { adminClient } from './setup/clients.js';
```

- [ ] **Step 2: Append the describe block**

```ts
describe('accounts federation asymmetry', () => {
	it('a connected rep sees the brand org accounts (implicit direction)', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'accounts', RLS_IDS.accountBrandA);
	});

	it('a connected brand does NOT see the rep account book wholesale', async () => {
		// accountRepA IS federated, because the fixture order references it.
		// Prove the mechanism is the explicit link rather than blanket
		// connection access by adding a rep-owned account with no order.
		const admin = adminClient();
		const { data, error } = await admin
			.from('accounts')
			.insert({
				organization_id: RLS_IDS.orgRepA,
				business_name: 'RLS Unfederated Rep Account'
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		const unfederatedId = (data as { id: string }).id;

		try {
			const brandA = await personaClient('brandAAdmin');
			await expectHidden(brandA, 'accounts', unfederatedId);
		} finally {
			await admin.from('accounts').delete().eq('id', unfederatedId);
		}
	});

	it('a connected brand sees a rep account that an order federated', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'accounts', RLS_IDS.accountRepA);
	});

	it('account satellites follow the same asymmetry', async () => {
		const admin = adminClient();
		const { data, error } = await admin
			.from('account_locations')
			.insert({
				account_id: RLS_IDS.accountBrandA,
				organization_id: RLS_IDS.orgBrandA,
				name: 'RLS Probe Location'
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		const locationId = (data as { id: string }).id;

		try {
			const repA = await personaClient('repAAdmin');
			const repB = await personaClient('repBAdmin');
			await expectVisible(repA, 'account_locations', locationId);
			await expectHidden(repB, 'account_locations', locationId);
		} finally {
			await admin.from('account_locations').delete().eq('id', locationId);
		}
	});
});
```

- [ ] **Step 3: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/federation-implicit.test.ts`
Expected: 10 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/rls/federation-implicit.test.ts
git commit -m "test: cover accounts federation asymmetry between rep and brand orgs"
```

### Task 4.3: Brand expenses and receipts

**Files:**

- Modify: `tests/rls/federation-implicit.test.ts`

- [ ] **Step 1: Append a describe block covering `brand_expenses` and `expense_receipts`**

Using the same seed-assert-delete shape as Task 4.2, assert:

- A `brand_expenses` row on `RLS_IDS.brandRepAOwn` is visible to `repAAdmin`, hidden from `repBAdmin`, hidden from `brandBAdmin`.
- A `brand_expenses` row submitted by the connected rep org (`organization_id` = repA's org) against the connected brand's `brand_id` (`RLS_IDS.brandA1`) is visible to `brandAAdmin` (the brand owns `brandA1`), hidden from `repBAdmin`. The policy ("Expenses visible via federation" in `supabase/migrations/20260417000001_federation_rls.sql`) keys on `get_user_org_ids()`, not `get_connected_org_ids()`: it grants the brand org visibility into rows tagged to its own `brand_id` that were submitted by another org. It does not grant a connected rep visibility into the brand org's own-submitted expenses on brands the rep does not own.
- An `expense_receipts` row inherits the visibility of its parent expense: same visible set, same hidden set.
- `brandAMember`, scoped to `brandA1`, sees the `brandA1` expense and not a `brandA2` expense.

Read the real columns first with `docker exec supabase_db_threadline psql -U postgres -d postgres -c "\d brand_expenses"` and `-c "\d expense_receipts"`. Do not guess column names.

- [ ] **Step 2: Run and commit**

```bash
bunx vitest run --config vitest.rls.config.ts tests/rls/federation-implicit.test.ts
git add tests/rls/federation-implicit.test.ts
git commit -m "test: cover brand expense and receipt federation RLS"
```

---

## Phase 5: Explicit federation

Deliverable: proof that `orders`, `order_lines`, and the `federated_*_links` tables enforce §A.3, and that `auto_federate_order()` creates the links it should and only those.

### Task 5.1: The auto-federation trigger and order visibility

**Files:**

- Create: `tests/rls/federation-explicit.test.ts`

- [ ] **Step 1: Write the spec**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectHidden, expectVisible } from './setup/assert.js';

beforeAll(loadPersonaIds);

describe('auto_federate_order trigger', () => {
	it('creates an order link for an order against a connected brand', async () => {
		const { data } = await adminClient()
			.from('federated_order_links')
			.select('order_id, source_org_id, target_org_id, status')
			.eq('order_id', RLS_IDS.orderRepAOnBrandA);
		expect(data ?? []).toHaveLength(1);
		expect((data ?? [])[0]).toMatchObject({
			source_org_id: RLS_IDS.orgRepA,
			target_org_id: RLS_IDS.orgBrandA,
			status: 'active'
		});
	});

	it('creates an account link so the brand can see the ordering account', async () => {
		const { data } = await adminClient()
			.from('federated_account_links')
			.select('account_id, target_org_id')
			.eq('account_id', RLS_IDS.accountRepA);
		expect(data ?? []).toHaveLength(1);
		expect((data ?? [])[0]).toMatchObject({ target_org_id: RLS_IDS.orgBrandA });
	});

	it('creates no link for an order with no active connection', async () => {
		// orderRepBOnBrandB is Rep B against Brand B, with no connection at all.
		const { data } = await adminClient()
			.from('federated_order_links')
			.select('order_id')
			.eq('order_id', RLS_IDS.orderRepBOnBrandB);
		expect(data ?? []).toEqual([]);
	});
});

describe('orders and order_lines RLS', () => {
	it('the ordering rep sees its own order', async () => {
		const repA = await personaClient('repAAdmin');
		await expectVisible(repA, 'orders', RLS_IDS.orderRepAOnBrandA);
		await expectVisible(repA, 'order_lines', RLS_IDS.orderLineRepAOnBrandA);
	});

	it('the target brand sees the federated order and its lines', async () => {
		const brandA = await personaClient('brandAAdmin');
		await expectVisible(brandA, 'orders', RLS_IDS.orderRepAOnBrandA);
		await expectVisible(brandA, 'order_lines', RLS_IDS.orderLineRepAOnBrandA);
	});

	it('an unrelated org sees neither', async () => {
		const repB = await personaClient('repBAdmin');
		const brandB = await personaClient('brandBAdmin');
		await expectHidden(repB, 'orders', RLS_IDS.orderRepAOnBrandA);
		await expectHidden(repB, 'order_lines', RLS_IDS.orderLineRepAOnBrandA);
		await expectHidden(brandB, 'orders', RLS_IDS.orderRepAOnBrandA);
	});

	it('a connected rep does not see the brand internal orders', async () => {
		// orderBrandAInternal belongs to Brand A and has no federation link.
		const repA = await personaClient('repAAdmin');
		await expectHidden(repA, 'orders', RLS_IDS.orderBrandAInternal);
	});

	it('federated link rows are visible only to the two involved orgs', async () => {
		const repA = await personaClient('repAAdmin');
		const brandA = await personaClient('brandAAdmin');
		const repB = await personaClient('repBAdmin');

		for (const [label, client, expected] of [
			['rep A', repA, 1],
			['brand A', brandA, 1],
			['rep B', repB, 0]
		] as const) {
			const { data } = await client
				.from('federated_order_links')
				.select('order_id')
				.eq('order_id', RLS_IDS.orderRepAOnBrandA);
			expect(data ?? [], `${label} view of the link`).toHaveLength(expected);
		}
	});
});
```

- [ ] **Step 2: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/federation-explicit.test.ts`
Expected: 8 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/federation-explicit.test.ts
git commit -m "test: cover explicit order federation RLS and auto-federation trigger"
```

### Task 5.2: Federated write boundaries

**Files:**

- Modify: `tests/rls/federation-explicit.test.ts`

§A.3 says the brand side of a federated order may update status, not the whole row. That narrowing is exactly what a policy rewrite loses silently.

- [ ] **Step 1: Append the describe block**

```ts
describe('federated order write boundaries', () => {
	it('the target brand can advance the order status', async () => {
		const brandA = await personaClient('brandAAdmin');
		const { data, error } = await brandA
			.from('orders')
			.update({ status: 'confirmed' })
			.eq('id', RLS_IDS.orderRepAOnBrandA)
			.select('id');
		expect(error).toBeNull();
		expect(data ?? []).toEqual([{ id: RLS_IDS.orderRepAOnBrandA }]);

		await adminClient()
			.from('orders')
			.update({ status: 'submitted' })
			.eq('id', RLS_IDS.orderRepAOnBrandA);
	});

	it('an unrelated org cannot touch the order', async () => {
		const repB = await personaClient('repBAdmin');
		const { data, error } = await repB
			.from('orders')
			.update({ status: 'cancelled' })
			.eq('id', RLS_IDS.orderRepAOnBrandA)
			.select('id');
		if (error) {
			expect(error.code).toBe('42501');
		} else {
			expect(data ?? []).toEqual([]);
		}
	});

	it('federated link rows cannot be forged by a client', async () => {
		const repB = await personaClient('repBAdmin');
		const { error } = await repB.from('federated_order_links').insert({
			order_id: RLS_IDS.orderBrandAInternal,
			connection_id: RLS_IDS.connPending,
			source_org_id: RLS_IDS.orgBrandA,
			target_org_id: RLS_IDS.orgRepB,
			status: 'active'
		});
		expect(error?.code, 'link forgery must be denied').toBe('42501');
	});
});
```

- [ ] **Step 2: Run and commit**

```bash
bunx vitest run --config vitest.rls.config.ts tests/rls/federation-explicit.test.ts
git add tests/rls/federation-explicit.test.ts
git commit -m "test: cover federated order write boundaries and link forgery denial"
```

---

## Phase 6: Role gradient and brand scoping

Deliverable: proof that within one org, `admin`, `member`, `sales`, and `guest` get the write access §A.3 assigns them, and that `member_brand_access` narrows what a scoped member sees.

### Task 6.1: Write-permission gradient and privilege escalation

**Files:**

- Create: `tests/rls/roles.test.ts`

- [ ] **Step 1: Write the spec**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { MEMBER_ROW_IDS, PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectHidden, expectInsertDenied, expectVisible } from './setup/assert.js';

beforeAll(loadPersonaIds);

// A.3: seasons, shows, source_types, territories INSERT is admin/owner only.
const ADMIN_ONLY_TABLES = ['seasons', 'shows', 'source_types', 'territories'] as const;

describe('role gradient on admin-only tables', () => {
	it('admin can insert into admin-only tables', async () => {
		const brandAAdmin = await personaClient('brandAAdmin');
		for (const table of ADMIN_ONLY_TABLES) {
			const { data, error } = await brandAAdmin
				.from(table)
				.insert({ organization_id: RLS_IDS.orgBrandA, name: `RLS role probe ${table}` })
				.select('id')
				.single();
			expect(error, `${table} insert as admin`).toBeNull();
			await adminClient()
				.from(table)
				.delete()
				.eq('id', (data as { id: string }).id);
		}
	});

	it('sales cannot insert into admin-only tables', async () => {
		const brandASales = await personaClient('brandASales');
		for (const table of ADMIN_ONLY_TABLES) {
			await expectInsertDenied(brandASales, table, {
				organization_id: RLS_IDS.orgBrandA,
				name: `RLS role probe ${table}`
			});
		}
	});

	it('guest cannot insert into admin-only tables', async () => {
		const brandAGuest = await personaClient('brandAGuest');
		for (const table of ADMIN_ONLY_TABLES) {
			await expectInsertDenied(brandAGuest, table, {
				organization_id: RLS_IDS.orgBrandA,
				name: `RLS role probe ${table}`
			});
		}
	});

	it('sales can insert an appointment (A.3 allows admin/owner/member/sales)', async () => {
		const brandASales = await personaClient('brandASales');
		const { data, error } = await brandASales
			.from('appointments')
			.insert({
				organization_id: RLS_IDS.orgBrandA,
				title: 'RLS sales appointment',
				created_by: PERSONA_IDS.brandASales
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		await adminClient()
			.from('appointments')
			.delete()
			.eq('id', (data as { id: string }).id);
	});
});

describe('privilege escalation is denied', () => {
	it('a non-admin cannot promote themselves', async () => {
		const brandASales = await personaClient('brandASales');
		const { data, error } = await brandASales
			.from('organization_members')
			.update({ role: 'admin' })
			.eq('profile_id', PERSONA_IDS.brandASales!)
			.select('id');
		if (error) {
			expect(error.code).toBe('42501');
		} else {
			expect(data ?? [], 'role self-escalation must affect no rows').toEqual([]);
		}
	});

	it('a non-admin cannot add themselves to another org', async () => {
		const brandASales = await personaClient('brandASales');
		await expectInsertDenied(brandASales, 'organization_members', {
			organization_id: RLS_IDS.orgRepA,
			profile_id: PERSONA_IDS.brandASales,
			role: 'admin'
		});
	});
});

describe('member_brand_access scoping', () => {
	it('a scoped member sees only the granted brand', async () => {
		const scoped = await personaClient('brandAMember');
		await expectVisible(scoped, 'brands', RLS_IDS.brandA1);
		await expectHidden(scoped, 'brands', RLS_IDS.brandA2);
	});

	it('an unscoped admin in the same org sees both brands', async () => {
		const brandAAdmin = await personaClient('brandAAdmin');
		await expectVisible(brandAAdmin, 'brands', RLS_IDS.brandA1);
		await expectVisible(brandAAdmin, 'brands', RLS_IDS.brandA2);
	});

	it('a scoped member cannot grant themselves more brands', async () => {
		const scoped = await personaClient('brandAMember');
		await expectInsertDenied(scoped, 'member_brand_access', {
			member_id: MEMBER_ROW_IDS.brandAMember,
			brand_id: RLS_IDS.brandA2,
			granted_by: PERSONA_IDS.brandAMember
		});
	});
});
```

- [ ] **Step 2: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/roles.test.ts`
Expected: 9 passed. The two tests in `privilege escalation is denied` and "a scoped member cannot grant themselves more brands" are critical. A failure in any of them stops the plan: report to the user before starting the next task.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/roles.test.ts
git commit -m "test: cover role gradient, escalation denial, and brand scoping RLS"
```

### Task 6.2: Manager rollup

**Files:**

- Modify: `tests/rls/roles.test.ts`

`get_managed_member_ids()` and `get_managed_profile_ids()` drive sales-rollup filters. The fixture has `repASales` reporting to `repAAdmin`.

- [ ] **Step 1: Append a describe block asserting**

- `repAAdmin` sees the `organization_members` row for `repASales` (`MEMBER_ROW_IDS.repASales`).
- `repASales` cannot update `repAAdmin`'s member row `role`. Use `expectUpdateDenied`.
- An order created by `repASales` is visible to `repAAdmin`. Seed with the service-role client using `organization_id: RLS_IDS.orgRepA`, `brand_id: RLS_IDS.brandRepAOwn`, `created_by: PERSONA_IDS.repASales`, `status: 'draft'`, then delete it in a `finally`.
- `repBAdmin` sees neither the member row nor that order.

Add `expectUpdateDenied` to the import list from `./setup/assert.js`.

- [ ] **Step 2: Run and commit**

```bash
bunx vitest run --config vitest.rls.config.ts tests/rls/roles.test.ts
git add tests/rls/roles.test.ts
git commit -m "test: cover manager rollup visibility under RLS"
```

---

## Phase 7: Buyer surface

Deliverable: proof that a buyer sees exactly their own accounts, the brands granted through `account_brand_access`, those brands' products, and their own draft orders, and nothing else.

Helpers under test: `get_buyer_account_ids()`, `get_buyer_brand_ids()`, `is_buyer_user()`.

### Task 7.1: Buyer read surface

**Files:**

- Create: `tests/rls/buyer.test.ts`

- [ ] **Step 1: Write the spec**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { RLS_IDS } from './setup/ids.js';
import { PERSONA_IDS, loadPersonaIds, personaClient } from './setup/fixture.js';
import { expectHidden, expectVisible } from './setup/assert.js';

beforeAll(loadPersonaIds);

describe('buyer read surface', () => {
	it('sees their own account', async () => {
		const buyer = await personaClient('buyer');
		await expectVisible(buyer, 'accounts', RLS_IDS.accountBrandA);
	});

	it('does not see other accounts in the same brand org or elsewhere', async () => {
		const buyer = await personaClient('buyer');
		await expectHidden(buyer, 'accounts', RLS_IDS.accountRepA);
		await expectHidden(buyer, 'accounts', RLS_IDS.accountBrandB);
	});

	it('sees only brands granted via account_brand_access', async () => {
		const buyer = await personaClient('buyer');
		await expectVisible(buyer, 'brands', RLS_IDS.brandA1);
		await expectHidden(buyer, 'brands', RLS_IDS.brandA2);
		await expectHidden(buyer, 'brands', RLS_IDS.brandB1);
	});

	it('sees products of granted brands only', async () => {
		const buyer = await personaClient('buyer');
		await expectVisible(buyer, 'products', RLS_IDS.productA1);
		await expectHidden(buyer, 'products', RLS_IDS.productB1);
	});

	it('sees every order on their own account, regardless of who created it', async () => {
		// The live policy "Buyers see own account orders"
		// (supabase/migrations/20260407000001_buyer_portal.sql) is
		//   USING (account_id IN (SELECT get_buyer_account_ids()))
		// which is account-scoped, not creator-scoped. orderBrandAInternal
		// belongs to accountBrandA, the buyer's own account, even though a
		// brand staff member created it on the account's behalf; per the
		// policy that is visible to the buyer by design. orderRepAOnBrandA
		// belongs to a different account, so it stays hidden.
		const buyer = await personaClient('buyer');
		await expectVisible(buyer, 'orders', RLS_IDS.orderBrandAInternal);
		await expectHidden(buyer, 'orders', RLS_IDS.orderRepAOnBrandA);
	});

	it('cannot enumerate the brand org staff', async () => {
		const buyer = await personaClient('buyer');
		const { data } = await buyer
			.from('organization_members')
			.select('id')
			.eq('organization_id', RLS_IDS.orgBrandA);
		expect(data ?? [], 'buyer must not enumerate brand staff').toEqual([]);
	});

	it('does not see other buyers account_users rows', async () => {
		const buyer = await personaClient('buyer');
		const { data } = await buyer.from('account_users').select('profile_id');
		const profiles = ((data ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id);
		expect(new Set(profiles)).toEqual(new Set([PERSONA_IDS.buyer]));
	});
});
```

- [ ] **Step 2: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/buyer.test.ts`
Expected: 7 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/rls/buyer.test.ts
git commit -m "test: cover buyer portal RLS read surface"
```

### Task 7.2: Buyer write surface

**Files:**

- Modify: `tests/rls/buyer.test.ts`

§A.3 gives buyers INSERT on `orders` (draft) and `order_lines` (draft), and UPDATE on their own draft orders only.

- [ ] **Step 1: Append a describe block asserting**

- A buyer can insert an order with `organization_id: RLS_IDS.orgBrandA`, `brand_id: RLS_IDS.brandA1`, `account_id: RLS_IDS.accountBrandA`, `created_by: PERSONA_IDS.buyer`, `status: 'draft'`. Capture the id with `expectInsertAllowed`.
- A buyer can insert an `order_lines` row on that draft order (`order_id` is the captured id, `qty: 1`, `unit_price: 50`; never send `line_total`).
- A buyer **cannot** insert an order against `RLS_IDS.brandA2`, which is not granted through `account_brand_access`. Use `expectInsertDenied`.
- A buyer **cannot** insert an order with `account_id: RLS_IDS.accountRepA`. Use `expectInsertDenied`.
- A buyer **cannot** flip their own draft order to `confirmed`. Use `expectUpdateDenied`.
- Delete the created order with the service-role client in a `finally`, which cascades the line.

Add `expectInsertAllowed`, `expectInsertDenied`, and `expectUpdateDenied` to the import list, and `adminClient` from `./setup/clients.js`.

- [ ] **Step 2: Run and commit**

```bash
bunx vitest run --config vitest.rls.config.ts tests/rls/buyer.test.ts
git add tests/rls/buyer.test.ts
git commit -m "test: cover buyer portal RLS write boundaries"
```

---

## Phase 8: Public-by-token tables

Deliverable: proof that the tables whose SELECT policy is `USING (true)` are write-locked to anonymous clients, and a pinned record of exactly what they expose for reading.

Tables: `invitations`, `buyer_invitations`, `connection_invites`, `connection_member_invites`.

These are the highest-exposure policies in the map, because `USING (true)` means an anonymous client can read every row. These tests do not assert the policy is right. They pin the current behavior so a future change shows up as a failing test, and they prove the write side is locked.

### Task 8.1: Pin the public exposure

**Files:**

- Create: `tests/rls/public-token.test.ts`

- [ ] **Step 1: Write the spec**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { RLS_IDS } from './setup/ids.js';
import { PERSONA_IDS, loadPersonaIds } from './setup/fixture.js';

beforeAll(loadPersonaIds);

/**
 * These tables carry USING (true) SELECT policies so an unauthenticated
 * visitor can resolve an invite by token or code. That means anon can read
 * every row. These tests pin the current exposure so any widening or
 * narrowing shows up as a failing test rather than a silent change.
 *
 * If one fails after a policy change, decide deliberately whether the new
 * exposure is intended before updating the expectation.
 */
describe('public-by-token tables', () => {
	it('anon can resolve a connection invite (documented exposure)', async () => {
		// Inserting a brand org fires trg_create_connection_invite, so Brand A
		// already has one.
		const { data, error } = await anonClient()
			.from('connection_invites')
			.select('id, brand_org_id')
			.eq('brand_org_id', RLS_IDS.orgBrandA);
		expect(error).toBeNull();
		expect((data ?? []).length).toBeGreaterThan(0);
	});

	it('anon reading invitations is pinned to the current exposure', async () => {
		const admin = adminClient();
		const { data, error } = await admin
			.from('invitations')
			.insert({
				organization_id: RLS_IDS.orgBrandA,
				email: 'invitee@rls-test.threadline.local',
				role: 'member',
				invited_by: PERSONA_IDS.brandAAdmin
			})
			.select('id')
			.single();
		expect(error).toBeNull();
		const inviteId = (data as { id: string }).id;

		try {
			const { data: anonRows } = await anonClient()
				.from('invitations')
				.select('id, email')
				.eq('id', inviteId);
			// Documents what anon actually gets. If this flips, the policy
			// changed and someone needs to have decided that on purpose.
			expect((anonRows ?? []).length).toBe(1);
		} finally {
			await admin.from('invitations').delete().eq('id', inviteId);
		}
	});

	it('anon cannot write to any invite table', async () => {
		const anon = anonClient();
		const attempts: Array<[string, Record<string, unknown>]> = [
			[
				'invitations',
				{
					organization_id: RLS_IDS.orgBrandA,
					email: 'forged@rls-test.threadline.local',
					role: 'admin'
				}
			],
			[
				'buyer_invitations',
				{
					organization_id: RLS_IDS.orgBrandA,
					account_id: RLS_IDS.accountBrandA,
					email: 'forged@rls-test.threadline.local'
				}
			],
			['connection_invites', { brand_org_id: RLS_IDS.orgBrandA, code: 'RLSFORGED' }]
		];
		for (const [table, row] of attempts) {
			const { error } = await anon.from(table).insert(row);
			expect(error?.code, `anon insert into ${table} must be denied`).toBe('42501');
		}
	});

	it('anon cannot redirect an invite by updating it', async () => {
		const { data, error } = await anonClient()
			.from('connection_invites')
			.update({ brand_org_id: RLS_IDS.orgRepB })
			.eq('brand_org_id', RLS_IDS.orgBrandA)
			.select('id');
		if (error) {
			expect(error.code).toBe('42501');
		} else {
			expect(data ?? []).toEqual([]);
		}
	});
});
```

- [ ] **Step 2: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/public-token.test.ts`
Expected: 4 passed. If the write tests fail, that is a critical finding: an anonymous client can forge invitations. Stop and report.

- [ ] **Step 3: Note the exposure in the PR description**

State plainly that `invitations` and `connection_invites` are anon-enumerable by design and that these tests pin the behavior rather than endorse it. Narrowing them is a separate policy change with its own ticket.

- [ ] **Step 4: Commit**

```bash
git add tests/rls/public-token.test.ts
git commit -m "test: pin public-by-token table RLS exposure"
```

---

## Phase 9: Storage buckets

Deliverable: a test that records the actual storage policy behavior for `brand-assets` and `expense-receipts`.

§A.3 documents both buckets as authenticated-only with no org scoping, meaning any signed-in user of any org can read any object. This phase pins that so it cannot get worse silently, and produces the evidence for a ticket.

### Task 9.1: Storage access characterization

**Files:**

- Create: `tests/rls/storage.test.ts`

- [ ] **Step 1: Write the spec**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, anonClient } from './setup/clients.js';
import { loadPersonaIds, personaClient } from './setup/fixture.js';

beforeAll(loadPersonaIds);

const OBJECT_PATH = 'rls-test/probe.txt';

async function uploadProbe(bucket: string): Promise<void> {
	const { error } = await adminClient()
		.storage.from(bucket)
		.upload(OBJECT_PATH, new Blob(['probe']), { upsert: true });
	if (error) throw new Error(`storage probe upload to ${bucket} failed: ${error.message}`);
}

async function removeProbe(bucket: string): Promise<void> {
	await adminClient().storage.from(bucket).remove([OBJECT_PATH]);
}

describe('storage bucket policies', () => {
	it('anon cannot read a brand-assets object', async () => {
		await uploadProbe('brand-assets');
		try {
			const { error } = await anonClient().storage.from('brand-assets').download(OBJECT_PATH);
			expect(error, 'anon must not download brand assets').not.toBeNull();
		} finally {
			await removeProbe('brand-assets');
		}
	});

	/**
	 * Documented gap: A.3 says both buckets are gated on `authenticated`
	 * only, with no organization scoping. This test asserts the CURRENT
	 * behavior so it is visible and diffable. It is not an endorsement.
	 * See the ticket raised in Step 3.
	 */
	it('any authenticated user of any org can read a brand-assets object', async () => {
		await uploadProbe('brand-assets');
		try {
			const outsider = await personaClient('repBAdmin');
			const { data, error } = await outsider.storage.from('brand-assets').download(OBJECT_PATH);
			expect(error).toBeNull();
			expect(data).not.toBeNull();
		} finally {
			await removeProbe('brand-assets');
		}
	});

	it('expense-receipts behaves the same way', async () => {
		await uploadProbe('expense-receipts');
		try {
			const outsider = await personaClient('repBAdmin');
			const { error } = await outsider.storage.from('expense-receipts').download(OBJECT_PATH);
			expect(error).toBeNull();
		} finally {
			await removeProbe('expense-receipts');
		}
	});
});
```

- [ ] **Step 2: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/storage.test.ts`
Expected: 3 passed. If the outsider is denied, the buckets are better scoped than §A.3 claims. Update the Storage table in `docs/brd/permissions-implementation-map.md` §A.3 and flip the assertion in the same commit.

- [ ] **Step 3: Report the gap to the user**

Report: cross-org storage read is unrestricted for both buckets, with the test as evidence. Ask whether to open a Linear ticket now or fold it into an existing security milestone. Do not fix the storage policies inside this plan.

- [ ] **Step 4: Commit**

```bash
git add tests/rls/storage.test.ts
git commit -m "test: characterize storage bucket RLS behavior"
```

---

## Phase 10: CI

Deliverable: the RLS suite runs on every PR into `dev` and `main`.

### Task 10.1: Add the CI job

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Verify the CLI status output shape locally**

Run: `bunx supabase status -o json | head -20`
If `-o json` is unsupported on the pinned CLI version, note it: Step 2 has an alternative using `-o env`.

- [ ] **Step 2: Append a job to the end of `.github/workflows/ci.yml`**

```yaml
rls:
  name: RLS
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: latest
    - uses: supabase/setup-cli@v1
      with:
        version: latest
    - name: Install dependencies
      run: bun install --frozen-lockfile
    - name: Start Supabase
      run: supabase start
    - name: Write .env from the local stack
      run: supabase status -o env > .env
    - name: Run RLS tests
      run: bun run test:rls
    - name: Stop Supabase
      if: always()
      run: supabase stop
```

`supabase status -o env` emits `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY`, not the names the env module expects. Add a mapping step after it:

```yaml
- name: Map env names
  run: |
    {
      echo "PUBLIC_SUPABASE_URL=$(grep '^API_URL=' .env | cut -d= -f2- | tr -d '\"')"
      echo "PUBLIC_SUPABASE_ANON_KEY=$(grep '^ANON_KEY=' .env | cut -d= -f2- | tr -d '\"')"
      echo "SUPABASE_SERVICE_ROLE_KEY=$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2- | tr -d '\"')"
    } >> .env
```

`supabase start` applies every migration in `supabase/migrations/` and then `supabase/seed.sql`, so the CI database matches local.

- [ ] **Step 3: Push and confirm the job passes on a real PR run**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the RLS test suite on pull requests"
git push -u origin test/rls-test-coverage
```

Do not mark this task complete until you have seen the `RLS` job go green on an actual PR. A workflow that only ran locally is not verified.

---

## Phase 11: supabaseAdmin bypass inventory (adjunct)

Deliverable: a test that fails when a new `supabaseAdmin` call site appears without review.

RLS tests prove nothing about code paths using the service-role client, because that client bypasses RLS entirely. Every `supabaseAdmin` call needs a server-derived ownership check in application code instead. This task does not verify those checks are correct. It makes the inventory visible so a new bypass cannot land unnoticed.

### Task 11.1: Call-site allowlist

**Files:**

- Create: `tests/rls/admin-bypass.test.ts`

- [ ] **Step 1: Generate the current inventory**

```bash
grep -rl 'supabaseAdmin' src --include=*.ts --include=*.svelte \
  | grep -v '^src/lib/server/supabase.ts$' | sort
```

- [ ] **Step 2: Write the spec, pasting the Step 1 output into `KNOWN_BYPASS_FILES`**

```ts
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';

/**
 * supabaseAdmin bypasses RLS. Every file listed here must derive its scope
 * from the session rather than from client input, and must deny on an empty
 * scope rather than widen. This test does not verify those checks. It fails
 * when the inventory changes, so a new bypass gets a human decision instead
 * of slipping in unnoticed.
 *
 * To update: read the new call site, confirm it has a server-derived
 * ownership check, then add the path here in the same PR.
 */
const KNOWN_BYPASS_FILES: string[] = [
	// Paste the Step 1 output here, one quoted path per line, sorted.
];

function currentBypassFiles(): string[] {
	const out = execSync("grep -rl 'supabaseAdmin' src --include=*.ts --include=*.svelte || true", {
		encoding: 'utf8'
	});
	return out
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && line !== 'src/lib/server/supabase.ts')
		.sort();
}

describe('supabaseAdmin bypass inventory', () => {
	it('has not changed without review', () => {
		const current = currentBypassFiles();
		const added = current.filter((f) => !KNOWN_BYPASS_FILES.includes(f));
		const removed = KNOWN_BYPASS_FILES.filter((f) => !current.includes(f));
		expect(
			{ added, removed },
			'A supabaseAdmin call site changed. Review the new site for a ' +
				'server-derived ownership check, then update KNOWN_BYPASS_FILES.'
		).toEqual({ added: [], removed: [] });
	});
});
```

- [ ] **Step 3: Run it**

Run: `bunx vitest run --config vitest.rls.config.ts tests/rls/admin-bypass.test.ts`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/rls/admin-bypass.test.ts
git commit -m "test: pin the supabaseAdmin RLS bypass inventory"
```

### Task 11.2: Full-suite gate and report

- [ ] **Step 1: Run everything**

```bash
bun run check
bun run test:run
bun run test:rls
bun run lint
```

Expected: 0 type errors, unit suite green, RLS suite green, lint clean.

- [ ] **Step 2: Confirm the local database is clean afterward**

```bash
docker exec supabase_db_threadline psql -U postgres -d postgres \
  -c "select count(*) from organizations where name like 'RLS %';" \
  -c "select count(*) from auth.users where email like '%@rls-test.threadline.local';"
```

Expected: both 0.

- [ ] **Step 3: Report to the user**

Report: how many RLS-enabled tables are now covered against the total (the Task 3.2 `comm` output gives the denominator), the size of the `supabaseAdmin` inventory, and every finding raised under core-loop rule 5c ranked by severity. Recommend which findings become Linear tickets.

- [ ] **Step 4: Open the PR**

Use `.claude/skills/git-pre` for the pre-PR gate. Target `dev`. Title: `test: add RLS policy coverage suite`.

---

## Self-Review

**Spec coverage against `docs/brd/permissions-implementation-map.md`:**

| Spec section                                                                       | Phase                    |
| ---------------------------------------------------------------------------------- | ------------------------ |
| §A.3 Own-org tables (no federation SELECT)                                         | 3                        |
| §A.3 Federation-aware tables (implicit)                                            | 4.1, 4.3                 |
| §A.3 Explicit federation tables                                                    | 5                        |
| §A.3 Connection management tables                                                  | 5.1 (links), 8 (invites) |
| §A.3 Accounts federation asymmetry                                                 | 4.2                      |
| §A.3 Storage (objects table)                                                       | 9                        |
| §A.2 `get_user_org_ids`, `is_org_member`                                           | 3                        |
| §A.2 `get_user_brand_ids`, `can_write_brands`                                      | 6.1                      |
| §A.2 `get_buyer_account_ids`, `get_buyer_brand_ids`, `is_buyer_user`               | 7                        |
| §A.2 `get_connected_org_ids`                                                       | 4                        |
| §A.2 `get_federated_order_ids`, `get_federated_account_ids`, `auto_federate_order` | 5                        |
| §A.6 Federation direction cheat-sheet, both directions                             | 4, 5                     |

**Out of scope, deliberately:**

- §A.4 per-route and §A.5 per-endpoint classification. HTTP-level concerns that belong to an E2E suite.
- `validate_org_member_manager`, `detach_reports_on_manager_demote`, `validate_territory_brand_org`. Data-integrity triggers, not access control. Worth unit tests, separate work.
- Correctness of the ownership checks guarding `supabaseAdmin` call sites. Phase 11 inventories them only.
- §A.2a "Helper Gap: Sales on Federated Brands". A known gap in `get_user_brand_ids`, not a test target until the gap is closed.
- §A.2 `get_managed_member_ids`, `get_managed_profile_ids`. Task 6.2 tests own-org visibility of `organization_members` and `orders` rows, which those helpers do not gate; the helpers feed application-layer query filters, not RLS policies, so they are out of scope for an RLS suite.
- DELETE policies. No test anywhere in this suite issues a delete through a persona client (`adminClient()`, which bypasses RLS, is used for all cleanup deletes). The DELETE column of the permissions contract is unverified across every table family. This is a real gap, not an oversight, and needs its own follow-up task and its own review rather than being folded into this suite's fix wave.

**Known risks carried into execution:**

1. Column names in the Phase 3 probe list are drawn from §A.3 table names, not from a per-table schema dump. Some will be wrong. Task 3.1 Step 2 gives the exact command to correct them, and `insertProbe` throws a message that says so.
2. `loadPersonaIds()` costs two round trips per spec file. That is the price of not relying on module state crossing the vitest globalSetup boundary. Do not optimize it away by moving seeding into `beforeAll` in each file: that would reseed nine auth users per file.
3. The CI job adds roughly 4 to 6 minutes to the pipeline. If that proves too slow, restrict it with `on: pull_request` only, dropping the `push` trigger for this job.
