import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadRepSetupState } from './insights-setup';

type Row = { organization_id: string };

/**
 * A fake client over in-memory tables that honors the filters the helper
 * uses (eq, in), so a test fails if the helper scopes to the wrong orgs.
 */
function fakeClient(tables: {
	connections?: Array<{ rep_org_id: string; brand_org_id: string; status: string }>;
	brands?: Row[];
	products?: Row[];
	accounts?: Row[];
	orders?: Row[];
}) {
	const source: Record<string, Array<Record<string, unknown>>> = {
		org_connections: tables.connections ?? [],
		brands: (tables.brands ?? []).map((r) => ({ ...r, is_active: true })),
		products: (tables.products ?? []).map((r) => ({ ...r, is_active: true })),
		accounts: (tables.accounts ?? []).map((r) => ({ ...r, is_active: true })),
		orders: tables.orders ?? []
	};
	return {
		from(table: string) {
			let rows = source[table];
			let head = false;
			const chain = {
				select: (_cols: string, opts?: { head?: boolean }) => {
					head = !!opts?.head;
					return chain;
				},
				eq: (col: string, value: unknown) => {
					rows = rows.filter((r) => r[col] === value);
					return chain;
				},
				in: (col: string, values: unknown[]) => {
					rows = rows.filter((r) => values.includes(r[col]));
					return chain;
				},
				then(resolve: (v: unknown) => void) {
					resolve(head ? { count: rows.length, error: null } : { data: rows, error: null });
				}
			};
			return chain;
		}
	} as unknown as SupabaseClient;
}

const REP = 'rep-1';
const BRAND = 'brand-1';
const OTHER = 'brand-other';

describe('loadRepSetupState', () => {
	it('counts only the rep org when it has no connections', async () => {
		const state = await loadRepSetupState(
			fakeClient({
				brands: [{ organization_id: REP }],
				products: [{ organization_id: REP }],
				accounts: [{ organization_id: REP }],
				orders: [{ organization_id: REP }]
			}),
			REP
		);
		expect(state).toEqual({
			hasBrands: true,
			hasProducts: true,
			hasAccounts: true,
			hasOrders: true
		});
	});

	it("is complete for a connected rep whose catalog and accounts are the brand's", async () => {
		const state = await loadRepSetupState(
			fakeClient({
				connections: [{ rep_org_id: REP, brand_org_id: BRAND, status: 'active' }],
				products: [{ organization_id: BRAND }],
				accounts: [{ organization_id: BRAND }]
			}),
			REP
		);
		expect(state).toMatchObject({ hasBrands: true, hasProducts: true, hasAccounts: true });
	});

	it('ignores connections that are not active', async () => {
		for (const status of ['pending', 'suspended', 'disconnected']) {
			const state = await loadRepSetupState(
				fakeClient({
					connections: [{ rep_org_id: REP, brand_org_id: BRAND, status }],
					products: [{ organization_id: BRAND }],
					accounts: [{ organization_id: BRAND }]
				}),
				REP
			);
			expect(state).toMatchObject({ hasBrands: false, hasProducts: false, hasAccounts: false });
		}
	});

	it("never counts an unconnected org's data", async () => {
		const state = await loadRepSetupState(
			fakeClient({
				connections: [{ rep_org_id: 'someone-else', brand_org_id: OTHER, status: 'active' }],
				products: [{ organization_id: OTHER }],
				accounts: [{ organization_id: OTHER }],
				orders: [{ organization_id: OTHER }]
			}),
			REP
		);
		expect(state).toEqual({
			hasBrands: false,
			hasProducts: false,
			hasAccounts: false,
			hasOrders: false
		});
	});

	it("keeps orders to the rep org's own", async () => {
		const state = await loadRepSetupState(
			fakeClient({
				connections: [{ rep_org_id: REP, brand_org_id: BRAND, status: 'active' }],
				orders: [{ organization_id: BRAND }]
			}),
			REP
		);
		expect(state.hasOrders).toBe(false);
	});
});
