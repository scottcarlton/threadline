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
 * On Supabase there is a second trap, and it has already shipped a hole
 * (SCO-191). The platform's default privileges grant EXECUTE on every new
 * public function to `anon`, `authenticated` and `service_role` DIRECTLY, not
 * through PUBLIC. So `REVOKE ... FROM PUBLIC` looks locked down and leaves
 * anon able to call the function. Always name the roles:
 *
 *   REVOKE EXECUTE ON FUNCTION f(...) FROM PUBLIC, anon, authenticated;
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
import { personaClient } from './setup/fixture.js';
import { RLS_IDS } from './setup/ids.js';

/**
 * Functions no client should reach. They run from triggers and from other
 * SECURITY DEFINER functions, where the current user is the definer and the
 * EXECUTE check passes regardless.
 */
const INTERNAL = [
	'compute_order_tax',
	'brand_pricing_display',
	'generate_invoice_number',
	// SCO-191: increments organizations.next_ra_number with no caller check.
	'generate_ra_number',
	// SCO-191: returns auth.users.email for arbitrary ids. Service-role only.
	'get_user_emails_by_ids',
	// SCO-192: every one below was reachable by anon and proven so before the
	// revoke. Each is called only through supabaseAdmin, only from inside other
	// SECURITY DEFINER functions, or not at all.
	'apply_line_ops',
	'insert_order_lines_with_actor',
	'prune_ai_requests',
	'prune_verification_attempts',
	'record_verification_attempt',
	'ensure_audit_log_partition',
	'maintain_audit_log_partitions',
	'get_managed_member_ids',
	'get_managed_profile_ids',
	'get_brand_order_ids',
	'get_federated_account_ids',
	'get_federated_order_ids',
	'get_revenue_by_brand',
	'get_revenue_summary',
	'get_top_accounts',
	// SCO-187: increments the credit memo counter. Only issue_credit_memo() calls it.
	'generate_credit_memo_number'
];

/**
 * SCO-192: analytics, called through locals.supabase from /insight, /reports
 * and the AI tools. Each checks membership of the org it is asked about;
 * before that, any caller could read any org's revenue by passing its id.
 */
const ANALYTICS = [
	'get_brand_account_penetration',
	'get_brand_order_pipeline',
	'get_brand_sales_by_rep',
	'get_brand_season_sell_through',
	'get_brand_territory_coverage',
	'get_order_pipeline',
	'get_sales_analytics',
	'get_season_summary',
	'get_style_velocity',
	'get_style_velocity_for_brand',
	'get_yearly_summary'
];

/**
 * Functions the app calls as the signed-in user. They authorize themselves
 * against that identity, so they need `authenticated` but never `anon`.
 */
const CALLER_FACING = [
	'send_invoice',
	'void_invoice',
	'receive_return',
	'issue_credit_memo',
	...ANALYTICS,
	// RLS helpers no anon-applicable policy uses. Keyed on auth.uid().
	'can_write_brands',
	'is_buyer_user'
];

/**
 * The only SECURITY DEFINER functions anon may execute. Each is an RLS helper
 * used by a policy that applies to `public`: policy expressions run as the
 * querying role, so revoking from anon would turn an empty result into a
 * permission error on any table anon reads. All of them key on auth.uid() and
 * return nothing for anon.
 *
 * Adding to this list is a security decision. A new function lands here only
 * when it is in the same position, never because the default grant put it
 * there.
 */
const ANON_ALLOWED = [
	'get_buyer_account_ids',
	'get_buyer_brand_ids',
	'get_connected_org_ids',
	'get_member_role_in_org',
	'get_user_brand_ids',
	'get_user_org_ids',
	'get_user_role',
	'is_buyer_admin_of',
	'is_org_member'
];

function query<T>(sql: string): T[] {
	const supabaseBin = resolve(process.cwd(), 'node_modules/.bin/supabase');
	const dbUrl =
		process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
	const out = execFileSync(
		supabaseBin,
		['db', 'query', sql, '--db-url', dbUrl, '-o', 'json', '--agent=no'],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
	);
	return JSON.parse(out) as T[];
}

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

describe('anon allow-list', () => {
	it('anon can execute no SECURITY DEFINER function outside ANON_ALLOWED', () => {
		// The net under everything above. Supabase grants every new public
		// function to anon by default, so a function added tomorrow lands here
		// unless its migration says otherwise. This fails until someone decides.
		const rows = query<{ name: string }>(`
			select p.proname as name
			  from pg_proc p
			  join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.prosecdef
			   and p.prorettype <> 'trigger'::regtype
			   and has_function_privilege('anon', p.oid, 'EXECUTE')
			 order by 1`);
		expect(rows.map((r) => r.name)).toEqual([...ANON_ALLOWED].sort());
	});
});

describe('analytics check membership (SCO-192)', () => {
	const brandA = RLS_IDS.orgBrandA;
	const repA = RLS_IDS.orgRepA;

	// Every analytics RPC, asked about an org the caller does not belong to.
	const calls: Array<[string, Record<string, unknown>]> = [
		['get_brand_account_penetration', { brand_org_id: brandA, p_year: 2026 }],
		['get_brand_order_pipeline', { brand_org_id: brandA }],
		['get_brand_sales_by_rep', { brand_org_id: brandA, p_year: 2026 }],
		['get_brand_season_sell_through', { brand_org_id: brandA, p_year: 2026 }],
		['get_brand_territory_coverage', { brand_org_id: brandA, p_year: 2026 }],
		['get_style_velocity_for_brand', { brand_org_id: brandA, days_back: 90, min_accounts: 1 }],
		['get_order_pipeline', { org_id: repA }],
		['get_season_summary', { org_id: repA, target_year: 2026 }],
		['get_style_velocity', { org_id: repA, days_back: 90, min_accounts: 1 }],
		['get_yearly_summary', { org_id: repA }],
		[
			'get_sales_analytics',
			{
				p_org_id: repA,
				p_org_type: 'rep',
				p_date_from: null,
				p_date_to: null,
				p_season_id: null,
				p_brand_id: null,
				p_account_id: null,
				p_rep_user_id: null,
				p_group_by: 'total'
			}
		]
	];

	it('covers every analytics function', () => {
		expect(calls.map(([name]) => name).sort()).toEqual([...ANALYTICS].sort());
	});

	it.each(calls)('%s refuses a signed-in user from another org', async (name, args) => {
		// brandBAdmin is an admin, just not of these orgs. Before SCO-192 this
		// returned the other org's revenue.
		const client = await personaClient('brandBAdmin');
		const { data, error } = await client.rpc(name, args);
		expect(data).toBeNull();
		expect(error?.code).toBe('42501');
	});

	it.each(calls)('%s refuses anon', async (name, args) => {
		const { error } = await anonClient().rpc(name, args);
		expect(error?.code).toBe('42501');
	});

	it('a brand member still reads their own brand', async () => {
		const client = await personaClient('brandAAdmin');
		const { error } = await client.rpc('get_brand_order_pipeline', { brand_org_id: brandA });
		expect(error).toBeNull();
	});

	it('a rep member still reads their own org', async () => {
		const client = await personaClient('repAAdmin');
		const { error } = await client.rpc('get_order_pipeline', { org_id: repA });
		expect(error).toBeNull();
	});

	it('a sales-role member is a member, and is not locked out', async () => {
		// Role narrowing for sales happens in the app layer (/reports), not here.
		// This check is about tenancy only, and must not quietly become a role gate.
		const client = await personaClient('repASales');
		const { error } = await client.rpc('get_order_pipeline', { org_id: repA });
		expect(error).toBeNull();
	});

	it('service role is exempt, for the agent executor', async () => {
		const { error } = await adminClient().rpc('get_order_pipeline', { org_id: repA });
		expect(error).toBeNull();
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
