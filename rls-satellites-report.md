# RLS federation satellites test coverage report

## Security findings

None. All four tables' policies behave exactly as described in the task brief and in
`docs/brd/permissions-implementation-map.md` §A.3/§A.4. No policy weakening, no assertion
weakening, and no plain-`it` characterization of a leak was needed.

## What was implemented

New file: `tests/rls/federation-satellites.test.ts`. One new spec file, no existing file
touched.

### `brand_assets` (symmetric federation)

Confirmed via `pg_policy`/`\d brand_assets` that "Brand assets visible via federation" is
`organization_id IN (SELECT get_connected_org_ids())`, which resolves in both directions.
Tests:

- Own-org positive (`brandAAdmin` sees a Brand A asset).
- Connected rep sees the brand org's asset (`repAAdmin`).
- Pending connection grants nothing (`repBAdmin` hidden).
- Unconnected org sees nothing (`brandBAdmin` hidden).
- Symmetric direction: `brandAAdmin` also sees a Rep A owned asset, with an inline comment
  noting this is deliberately symmetric, unlike accounts.

Matched the described direction exactly (symmetric).

### `product_images` (rep-side only)

Confirmed via `\d product_images` that "Rep sees connected brand product images" keys on
`org_connections.rep_org_id IN get_user_org_ids() AND status = 'active'`, i.e. only the rep
side of a connection benefits. No fixture product existed under Rep A's own brand
(`brandRepAOwn`), so the test seeds one temporary product (`RLS Rep A In-House Product`) in
`beforeAll` and deletes it in `afterAll` along with its images.

Tests: own-org positive, connected-rep federation, pending-denied, unconnected-denied, and
the direction assertion (`brandAAdmin` does NOT see the rep-owned image), paired with a
positive control (`repAAdmin` sees its own image via the own-org policy).

Matched the described direction exactly (rep-side only).

### `account_tags` (rep-side only, admin/owner-only writes)

Confirmed via `\d account_tags` that "Rep sees connected brand account tags" is
`organization_id IN (brand_org_id of active org_connections where rep_org_id IN
get_user_org_ids())`, and "Admins can manage account tags" gates ALL on
`role IN (admin, owner)`.

Tests: own-org positive, connected-rep federation, pending-denied, unconnected-denied,
direction assertion (brand does not see the rep's own tag, paired with a rep-side positive
control), plus a nested write-gate block:

- `brandAAdmin` CAN insert an `account_tags` row.
- `brandASales` CANNOT (plain `it`, not `it.fails`; asserts `42501` via `expectInsertDenied`).
- `brandAGuest` CANNOT.

Matched the described direction and write gate exactly.

### `account_tag_assignments` (rep-side only, non-guest writes)

Confirmed via `\d account_tag_assignments` that "Rep sees connected brand account tag
assignments" is the rep-side-only shape via an `accounts` join, and "Non-guest users can
manage tag assignments" gates ALL on `role <> 'guest'`.

Tests: own-org positive, connected-rep federation, pending-denied, unconnected-denied,
direction assertion (brand does not see the rep's own assignment, paired with a rep-side
positive control), plus a nested write-gate block:

- `brandASales` CAN insert an `account_tag_assignments` row (contrast with `account_tags`
  above, where sales is denied — this pairing is the explicit ask in the brief).
- `brandAGuest` CANNOT.

Each write-gate test uses a freshly created tag so the `(account_id, tag_id)` pair it
inserts is guaranteed new; `account_tag_assignments` has a unique constraint on that pair,
and reusing an existing pair would raise `23505` instead of exercising the `42501` RLS
denial the test characterizes.

Matched the described direction and write gate exactly.

## Schema corrections

None needed. The columns given in the task brief (`brand_assets`: `brand_id`,
`organization_id`, `name`, `file_path`; `product_images`: `product_id`, `file_path`;
`account_tags`: `organization_id`, `name`; `account_tag_assignments`: `account_id`,
`tag_id`) matched `\d <table>` exactly on the live local database. `products` (needed for
the one temporary rep-owned product in the `product_images` describe block) also matched
the existing fixture's insert shape (`organization_id`, `brand_id`, `name`, `style_number`,
`is_active`).

## Verification run

`bun run check`:

```
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
COMPLETED 6500 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
```

`bun run test:rls`, run 1:

```
 Test Files  10 passed (10)
      Tests  105 passed | 2 expected fail (107)
   Duration  6.73s
```

`bun run test:rls`, run 2 (back to back):

```
 Test Files  10 passed (10)
      Tests  105 passed | 2 expected fail (107)
   Duration  5.71s
```

Identical counts across both runs (105 passed + 2 expected fail, same as run 1), confirming
the new file cleans up after itself with no ordering fragility. Baseline was 77 passed + 2
expected fail; the new file added 28 passing tests. The expected-fail count stayed exactly
2, unchanged from baseline.

Cleanup check, run after both test:rls runs:

```
$ docker exec supabase_db_threadline psql -U postgres -d postgres \
  -c "select count(*) from organizations where name like 'RLS %';" \
  -c "select count(*) from auth.users where email like '%@rls-test.threadline.local';" \
  -c "select count(*) from brand_assets where name like 'RLS %';" \
  -c "select count(*) from account_tags where name like 'RLS %';"

 count
-------
     0
(1 row)

 count
-------
     0
(1 row)

 count
-------
     0
(1 row)

 count
-------
     0
(1 row)
```

All four counts are 0.

## Concerns

None outstanding. The file follows the seeding/cleanup style of
`federation-implicit.test.ts` (service-role inserts in `beforeAll`, unconditional deletes in
`afterAll`/`finally`, `personaClient` for RLS-exercising reads/writes, `expectVisible` /
`expectHidden` / `expectInsertAllowed` / `expectInsertDenied` from `setup/assert.ts`). No
`it.fails` was used anywhere; all denial assertions are plain `it` blocks using
`expectInsertDenied`, which checks Postgres error code `42501` specifically, and every
denial in the file inserts an otherwise-valid row so the denial cannot pass for the wrong
reason (malformed row vs. RLS block).

---

## Fix round 1: write-gate coverage for brand_assets and product_images

### Finding addressed

Critical: `brand_assets` and `product_images` had no write-gate tests, even though "at
minimum, for each of the four tables" in the original brief bound write gates too. Both
tables' write policies gate on `get_user_role(organization_id) IN (admin, owner, member)`
(the `product_images` gate is via a `products` join). `sales` is not in that allowed set on
either table.

### What was added

`brand_assets` (in `tests/rls/federation-satellites.test.ts`, nested `describe('write gates:
insert/delete restricted to admin/owner/member')`):

- `an admin can insert a brand asset` — positive control via `expectInsertAllowed`, deleted
  in a `finally`.
- `a sales role cannot insert a brand asset` — `expectInsertDenied` (asserts `42501`).
- `a guest cannot insert a brand asset` — `expectInsertDenied`.
- `an admin can delete a brand asset it owns` — seeds a temp row via `adminClient()`, deletes
  it with the `brandAAdmin` persona client using `.delete().eq('id', id).select('id')`, and
  asserts the deleted row comes back with no error. `expectUpdateDenied`/`expectUpdateAllowed`
  patterns exist in `setup/assert.ts` for UPDATE but there is no DELETE equivalent, and the
  brief said not to add one; this test asserts the delete outcome directly, following the
  same inline pattern `federation-implicit.test.ts` already uses for its UPDATE-denial test.
- `a non-member org cannot delete a brand asset it does not own` — same temp-row seed, deleted
  attempt via `brandBAdmin`. A DELETE blocked by RLS has no `WITH CHECK` to violate, so it
  returns zero affected rows rather than an error; the test accepts either an empty result or
  a `42501` error, matching how `expectUpdateDenied` already treats the same ambiguity for
  UPDATE.

`product_images` (nested `describe('write gate: managing images restricted to
admin/owner/member')`):

- `an admin can insert a product image` — positive control via `expectInsertAllowed`, deleted
  in a `finally`.
- `a sales role cannot insert a product image` — `expectInsertDenied`.
- `a guest cannot insert a product image` — `expectInsertDenied`.

No DELETE pair was added for `product_images`; the brief only asked for the DELETE pair on
`brand_assets` and made it optional there.

### brandASales outcome

`brandASales` was DENIED on both tables, exactly as `pg_policy` predicts (sales is absent
from the `admin, owner, member` allow-list on both). No security finding here — this is the
opposite of the `account_tag_assignments` gate, where the same `brandASales` persona IS
allowed to write (non-guest gate), and that contrast is called out in a comment at the top
of each new `describe` block.

### Verification run

`bun run check`:

```
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
COMPLETED 6500 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
```

`bun run test:rls`, run 1:

```
 Test Files  10 passed (10)
      Tests  113 passed | 2 expected fail (115)
   Duration  6.42s
```

`bun run test:rls`, run 2 (back to back):

```
 Test Files  10 passed (10)
      Tests  113 passed | 2 expected fail (115)
   Duration  5.91s
```

Identical counts across both runs. 105 -> 113 passed (8 new tests: 5 for `brand_assets`, 3
for `product_images`). Expected-fail count stayed exactly 2.

Cleanup check, including `brand_assets` and `product_images` rows this time:

```
$ docker exec supabase_db_threadline psql -U postgres -d postgres \
  -c "select count(*) from organizations where name like 'RLS %';" \
  -c "select count(*) from auth.users where email like '%@rls-test.threadline.local';" \
  -c "select count(*) from brand_assets where name like 'RLS %';" \
  -c "select count(*) from account_tags where name like 'RLS %';" \
  -c "select count(*) from product_images where file_path like 'rls-probe/%';"

 count
-------
     0
(1 row)

 count
-------
     0
(1 row)

 count
-------
     0
(1 row)

 count
-------
     0
(1 row)

 count
-------
     0
(1 row)
```

All five counts are 0.

### Concerns

None. `beforeAll` seed blocks remain without try/finally per the coordinator's explicit
instruction to leave that as-is for consistency with `federation-implicit.test.ts`.

Commit: 37d82ba "test: add write-gate coverage for brand_assets and product_images"
