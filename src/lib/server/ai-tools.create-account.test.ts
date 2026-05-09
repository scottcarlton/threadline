import { describe, it, expect } from 'vitest';
import { executeToolCall } from './ai-tools.js';

type MockRow = Record<string, unknown>;

type SelectCall = {
	filters: Array<{ op: string; col?: string; val?: unknown }>;
	limitN?: number;
	mode?: 'single' | 'maybeSingle' | 'list';
};

type FromState = {
	rows: MockRow[];
	inserted: MockRow[];
	selectCalls: SelectCall[];
};

function buildQuery(state: FromState) {
	let current: SelectCall = { filters: [] };

	const chain: Record<string, unknown> = {
		select() {
			current = { filters: [] };
			state.selectCalls.push(current);
			return chain;
		},
		eq(col: string, val: unknown) {
			current.filters.push({ op: 'eq', col, val });
			return chain;
		},
		ilike(col: string, val: unknown) {
			current.filters.push({ op: 'ilike', col, val });
			return chain;
		},
		limit(n: number) {
			current.limitN = n;
			return chain;
		},
		async maybeSingle() {
			current.mode = 'maybeSingle';
			const match = findMatching(state.rows, current.filters);
			return { data: match, error: null };
		},
		async single() {
			current.mode = 'single';
			// For insert().select().single() the most-recent insert is returned
			const last = state.inserted[state.inserted.length - 1] ?? null;
			return { data: last, error: null };
		},
		insert(row: MockRow | MockRow[]) {
			const toInsert = Array.isArray(row) ? row : [row];
			for (const r of toInsert) {
				state.inserted.push({ id: `acc-${state.inserted.length + 1}`, is_active: true, ...r });
			}
			return chain;
		}
	};
	return chain;
}

function findMatching(rows: MockRow[], filters: SelectCall['filters']) {
	const ilikeMatch = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
	const match = rows.find((row) => {
		return filters.every((f) => {
			if (f.op === 'eq') return row[f.col!] === f.val;
			if (f.op === 'ilike') return ilikeMatch(String(row[f.col!] ?? ''), String(f.val ?? ''));
			return true;
		});
	});
	return match ?? null;
}

function makeCtx(rows: MockRow[]) {
	const state: FromState = { rows, inserted: [], selectCalls: [] };
	const supabase = {
		from() {
			return buildQuery(state);
		}
	} as unknown as import('@supabase/supabase-js').SupabaseClient;

	return {
		ctx: {
			supabase,
			organizationId: 'org-1',
			userId: 'user-1',
			brandScope: null,
			orgType: 'rep' as const,
			origin: 'http://localhost'
		},
		state
	};
}

describe('create_account dedupe', () => {
	it('returns the existing account with already_exists=true on case-insensitive name match', async () => {
		const { ctx, state } = makeCtx([
			{
				id: 'acc-existing',
				business_name: 'Bloom Boutique',
				city: 'Denver',
				state: 'CO',
				organization_id: 'org-1',
				is_active: true
			}
		]);

		const result = await executeToolCall(
			'create_account',
			{ business_name: 'bloom boutique' },
			ctx
		);

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			id: 'acc-existing',
			business_name: 'Bloom Boutique',
			city: 'Denver',
			state: 'CO',
			already_exists: true
		});
		expect(state.inserted).toHaveLength(0);
	});

	it('returns a federated match with connected=true when the existing row is in another visible org', async () => {
		// RLS lets the rep see a BOA-owned account via federation; dedupe should
		// catch it and flag it connected instead of inserting a local duplicate.
		const { ctx, state } = makeCtx([
			{
				id: 'acc-federated',
				business_name: 'Bloom Boutique',
				organization_id: 'org-OTHER',
				is_active: true
			}
		]);

		const result = await executeToolCall(
			'create_account',
			{ business_name: 'Bloom Boutique' },
			ctx
		);

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			id: 'acc-federated',
			business_name: 'Bloom Boutique',
			already_exists: true,
			connected: true
		});
		expect(state.inserted).toHaveLength(0);
	});

	it('ignores inactive matches (own-org or federated) and creates a fresh one', async () => {
		const { ctx, state } = makeCtx([
			{
				id: 'acc-archived',
				business_name: 'Bloom Boutique',
				organization_id: 'org-1',
				is_active: false
			},
			{
				id: 'acc-archived-fed',
				business_name: 'Bloom Boutique',
				organization_id: 'org-OTHER',
				is_active: false
			}
		]);

		const result = await executeToolCall(
			'create_account',
			{ business_name: 'Bloom Boutique' },
			ctx
		);

		expect(result.success).toBe(true);
		expect((result.data as Record<string, unknown>).already_exists).toBeUndefined();
		expect(state.inserted).toHaveLength(1);
	});

	it('inserts when no match exists', async () => {
		const { ctx, state } = makeCtx([]);

		const result = await executeToolCall(
			'create_account',
			{
				business_name: 'New Shop',
				city: 'Austin',
				state: 'TX'
			},
			ctx
		);

		expect(result.success).toBe(true);
		expect(state.inserted).toHaveLength(1);
		expect(state.inserted[0]).toMatchObject({
			business_name: 'New Shop',
			city: 'Austin',
			state: 'TX',
			organization_id: 'org-1'
		});
	});

	it('rejects empty business_name without hitting the DB', async () => {
		const { ctx, state } = makeCtx([]);
		const result = await executeToolCall('create_account', { business_name: '   ' }, ctx);
		expect(result.success).toBe(false);
		expect(state.selectCalls).toHaveLength(0);
		expect(state.inserted).toHaveLength(0);
	});
});
