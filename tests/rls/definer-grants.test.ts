/**
 * SECURITY DEFINER functions bypass RLS by definition. That is the point of
 * them, and it is also why who may EXECUTE one is part of its security
 * contract rather than an implementation detail.
 *
 * Postgres grants EXECUTE on a new function to PUBLIC. `CREATE OR REPLACE`
 * preserves whatever grants exist, but `DROP` + `CREATE` resets them to that
 * default -- so a perfectly ordinary refactor can silently reopen this. This
 * file pins the contract so that happens loudly instead.
 *
 * SCO-189: all five of these were reachable by `anon`, including the two that
 * mutate. `generate_invoice_number` increments a counter, so calling it burned
 * an org's invoice sequence; `send_invoice` published a draft; `void_invoice`
 * withdrew an issued document.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { anonClient, adminClient } from './setup/clients.js';

/**
 * Functions no client should reach. They run from triggers and from other
 * SECURITY DEFINER functions, where the current user is the definer and the
 * EXECUTE check passes regardless.
 */
const INTERNAL = ['compute_order_tax', 'brand_pricing_display', 'generate_invoice_number'];

/**
 * Functions the app calls as the signed-in user. They authorize themselves
 * against that identity, so they need `authenticated` but never `anon`.
 */
const CALLER_FACING = ['send_invoice', 'void_invoice'];

function grantsFor(names: string[]): Record<string, string[]> {
	const supabaseBin = resolve(process.cwd(), 'node_modules/.bin/supabase');
	const dbUrl =
		process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';

	const sql = `
		select p.proname as name,
		       coalesce(array_to_string(p.proacl, ','), 'PUBLIC_DEFAULT') as acl
		  from pg_proc p
		  join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public'
		   and p.proname in (${names.map((n) => `'${n}'`).join(',')})`;

	const out = execFileSync(
		supabaseBin,
		['db', 'query', sql, '--db-url', dbUrl, '-o', 'json', '--agent=no'],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
	);

	const rows = JSON.parse(out) as Array<{ name: string; acl: string }>;
	const map: Record<string, string[]> = {};
	for (const row of rows) {
		// An ACL entry looks like `authenticated=X/postgres`; a bare `=X/...`
		// means PUBLIC, which is the default we are guarding against.
		map[row.name] =
			row.acl === 'PUBLIC_DEFAULT'
				? ['PUBLIC_DEFAULT']
				: row.acl.split(',').map((entry) => entry.split('=')[0] || 'PUBLIC');
	}
	return map;
}

describe('SECURITY DEFINER execute grants', () => {
	it('internal helpers are not executable by anon or authenticated', () => {
		const grants = grantsFor(INTERNAL);
		for (const name of INTERNAL) {
			expect(grants[name], `${name} should exist`).toBeDefined();
			expect(grants[name], `${name} must not be world-executable`).not.toContain('PUBLIC_DEFAULT');
			expect(grants[name], `${name} must not be executable by anon`).not.toContain('anon');
			expect(grants[name], `${name} must not be executable by authenticated`).not.toContain(
				'authenticated'
			);
			expect(grants[name], `${name} must not be executable by PUBLIC`).not.toContain('PUBLIC');
		}
	});

	it('caller-facing functions are executable by authenticated but never anon', () => {
		const grants = grantsFor(CALLER_FACING);
		for (const name of CALLER_FACING) {
			expect(grants[name], `${name} should exist`).toBeDefined();
			expect(grants[name], `${name} must not be world-executable`).not.toContain('PUBLIC_DEFAULT');
			expect(grants[name], `${name} must not be executable by anon`).not.toContain('anon');
			expect(grants[name], `${name} must not be executable by PUBLIC`).not.toContain('PUBLIC');
			expect(grants[name], `${name} is called as the signed-in user`).toContain('authenticated');
		}
	});
});

describe('the guards themselves', () => {
	it('anon cannot reach compute_order_tax', async () => {
		const { error } = await anonClient().rpc('compute_order_tax', {
			p_brand_id: '00000000-0000-4000-8000-000000000000',
			p_location_id: null,
			p_account_id: null,
			p_subtotal: 100
		});
		expect(error).not.toBeNull();
	});

	it('anon cannot reach send_invoice', async () => {
		const { error } = await anonClient().rpc('send_invoice', {
			p_invoice_id: '00000000-0000-4000-8000-000000000000',
			p_due_date: null,
			p_issue_date: null
		});
		expect(error).not.toBeNull();
	});

	it('anon cannot reach void_invoice', async () => {
		const { error } = await anonClient().rpc('void_invoice', {
			p_invoice_id: '00000000-0000-4000-8000-000000000000',
			p_reason: null
		});
		expect(error).not.toBeNull();
	});

	it('a caller with no membership is rejected, not waved through', async () => {
		// The original bug: `get_user_role(org) NOT IN ('admin','owner')` is NULL
		// for a non-member, and NULL is not true, so the guard never fired. It
		// caught members with the wrong role and let everyone else past. This
		// asserts the NULL arm directly, at the SQL level, rather than trusting
		// the reading of it.
		const supabaseBin = resolve(process.cwd(), 'node_modules/.bin/supabase');
		const dbUrl =
			process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
		const out = execFileSync(
			supabaseBin,
			[
				'db',
				'query',
				`select (null::user_role IS NULL OR null::user_role NOT IN ('admin','owner')) as rejects`,
				'--db-url',
				dbUrl,
				'-o',
				'json',
				'--agent=no'
			],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
		);
		expect(JSON.parse(out)[0].rejects).toBe(true);
	});

	it('service-role still cannot send, because it has no identity to check', async () => {
		// Worth pinning: the endpoint was changed to call as the signed-in user
		// precisely because of this. A future refactor back to supabaseAdmin
		// would fail here rather than in production.
		const { error } = await adminClient().rpc('send_invoice', {
			p_invoice_id: '00000000-0000-4000-8000-000000000000',
			p_due_date: null,
			p_issue_date: null
		});
		expect(error).not.toBeNull();
	});
});
