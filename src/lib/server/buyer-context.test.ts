import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBuyerContext } from './buyer-context.js';

type Response = { data: unknown; error?: { message: string } | null };

/**
 * Hand-rolled chainable Supabase mock (same convention as retailers.test.ts /
 * connections.test.ts). Responses are keyed by table name; every `.from(table)`
 * call is recorded in `queriedTables` so tests can assert a table was NEVER hit.
 */
function makeClient(responses: Record<string, Response> = {}) {
	const queriedTables: string[] = [];

	const from = vi.fn((table: string) => {
		queriedTables.push(table);
		const response = responses[table] ?? { data: null, error: null };

		const builder: Record<string, unknown> = {};
		const passthrough = ['select', 'eq', 'in', 'is', 'limit', 'order'];
		for (const m of passthrough) {
			builder[m] = vi.fn(() => builder);
		}
		builder.single = vi.fn().mockResolvedValue(response);
		builder.maybeSingle = vi.fn().mockResolvedValue(response);
		(builder as { then: unknown }).then = (resolve: (v: Response) => void) => resolve(response);
		return builder;
	});

	const client = { from } as unknown as SupabaseClient;
	return { client, queriedTables };
}

describe('resolveBuyerContext', () => {
	it('returns not-a-buyer when account_users has no rows, and touches admin zero times', async () => {
		const { client } = makeClient({
			account_users: { data: [], error: null }
		});
		const { client: admin } = makeClient();

		const ctx = await resolveBuyerContext(client, admin, 'user-1');

		expect(ctx).toEqual({
			isBuyer: false,
			buyerAccounts: [],
			buyerBrandIds: [],
			organization: null
		});
		// No accounts → no account-scoped lookups; admin must not be touched.
		expect(admin.from).not.toHaveBeenCalled();
	});

	it('resolves an invited buyer with accounts, brand access, and org (regression guard)', async () => {
		const org = { id: 'org-1', name: 'Brand Org' };
		const { client } = makeClient({
			account_users: {
				data: [
					{ id: 'au-1', account_id: 'acct-1', accounts: { organization_id: 'org-1' } },
					{ id: 'au-2', account_id: 'acct-2', accounts: { organization_id: 'org-1' } }
				],
				error: null
			}
		});
		const { client: admin, queriedTables: adminTables } = makeClient({
			account_brand_access: {
				data: [{ brand_id: 'brand-1' }, { brand_id: 'brand-2' }],
				error: null
			},
			organizations: { data: org, error: null }
		});

		const ctx = await resolveBuyerContext(client, admin, 'user-1');

		expect(ctx.isBuyer).toBe(true);
		expect(ctx.buyerAccounts).toHaveLength(2);
		expect(ctx.buyerAccounts[0].account_id).toBe('acct-1');
		expect(ctx.buyerBrandIds).toEqual(['brand-1', 'brand-2']);
		expect(ctx.organization).toEqual(org);

		expect(adminTables).toContain('account_brand_access');
		expect(adminTables).toContain('organizations');
	});

	it('leaves organization null (but still resolves brand access) when the account has no org id', async () => {
		const { client } = makeClient({
			account_users: {
				data: [{ id: 'au-1', account_id: 'acct-1', accounts: {} }],
				error: null
			}
		});
		const { client: admin, queriedTables: adminTables } = makeClient({
			account_brand_access: { data: [{ brand_id: 'brand-1' }], error: null }
		});

		const ctx = await resolveBuyerContext(client, admin, 'user-1');

		expect(ctx.isBuyer).toBe(true);
		expect(ctx.buyerBrandIds).toEqual(['brand-1']);
		expect(ctx.organization).toBeNull();
		expect(adminTables).toContain('account_brand_access');
		expect(adminTables).not.toContain('organizations');
	});
});
