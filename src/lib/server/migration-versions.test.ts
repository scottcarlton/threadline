import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Repo invariant: no two migration files may share a version.
 *
 * `supabase_migrations.schema_migrations` has `version` as its primary key, so
 * a duplicate is not a tidiness problem. On a clean database `supabase start`
 * aborts:
 *
 *     ERROR: duplicate key value violates unique constraint
 *     "schema_migrations_pkey"  Key (version)=(20260915000001) already exists.
 *
 * That happened on `dev` when `20260915000001_invoice_payments.sql` (PR #311)
 * and `20260915000001_cart_items_variant_state.sql` (PR #312) merged one after
 * the other. Neither PR was red on its own, because each was tested against a
 * branch containing only its own file. The collision only existed once both
 * were on `dev`, and it took the RLS job down for `dev` and for every open PR
 * until one was renumbered.
 *
 * This test lives in the fast unit suite rather than the RLS preflight on
 * purpose: it gates every PR, needs no database, and fails in seconds at review
 * time instead of after the merge that creates the conflict.
 *
 * It cannot catch the cross-branch case by itself -- two unmerged branches each
 * holding the same unused version still look fine here. What it does catch is
 * the moment they meet, which on a merge queue is the merge commit, before the
 * result reaches anyone else.
 */
describe('supabase migrations', () => {
	const dir = resolve(process.cwd(), 'supabase/migrations');
	const VERSION_RE = /^(\d{14})_(.+)\.sql$/;

	const files = readdirSync(dir)
		.filter((name) => name.endsWith('.sql'))
		.sort();

	it('has migration files to check', () => {
		// Guards against the whole suite passing vacuously if the path moves.
		expect(files.length).toBeGreaterThan(0);
	});

	it('names every migration <14-digit version>_<name>.sql', () => {
		const malformed = files.filter((name) => !VERSION_RE.test(name));
		expect(malformed).toEqual([]);
	});

	it('never reuses a version across two files', () => {
		const byVersion = new Map<string, string[]>();
		for (const name of files) {
			const match = name.match(VERSION_RE);
			if (!match) continue;
			const version = match[1];
			byVersion.set(version, [...(byVersion.get(version) ?? []), name]);
		}

		const duplicates = [...byVersion.entries()]
			.filter(([, names]) => names.length > 1)
			.map(([version, names]) => `${version}: ${names.join(', ')}`);

		expect(duplicates).toEqual([]);
	});
});
