import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createStore } from './stores.js';

type Op = 'select' | 'insert' | 'update' | 'unknown';

type Captured = {
	op: Op;
	table: string;
	insertPayload?: Record<string, unknown>;
	updatePayload?: Record<string, unknown>;
	filters: Array<{ method: string; column: string; value: unknown }>;
};

type OpResponse = { data: unknown; error?: { message: string } | null };

function makeMock({
	select,
	insert,
	inserts,
	update
}: {
	select?: OpResponse;
	insert?: OpResponse;
	inserts?: Record<string, OpResponse>;
	update?: OpResponse;
} = {}) {
	const captured: Captured[] = [];

	function chain(op: Op, table: string): Record<string, unknown> {
		const rec: Captured = { op, table, filters: [] };
		captured.push(rec);

		const builder: Record<string, unknown> = {};
		const passthrough = ['eq', 'neq', 'in', 'is', 'limit', 'order'];
		for (const m of passthrough) {
			builder[m] = vi.fn((column: string, value: unknown) => {
				rec.filters.push({ method: m, column, value });
				return builder;
			});
		}

		builder.select = vi.fn(() => builder);

		const response =
			op === 'insert'
				? (inserts?.[table] ?? insert ?? { data: null, error: null })
				: op === 'update'
					? (update ?? { data: null, error: null })
					: (select ?? { data: null, error: null });

		builder.single = vi.fn().mockResolvedValue(response);
		builder.maybeSingle = vi.fn().mockResolvedValue(response);
		(builder as { then: unknown }).then = (resolve: (v: OpResponse) => void) => resolve(response);

		return builder;
	}

	const supabase = {
		from: vi.fn((table: string) => {
			const tableBuilder: Record<string, unknown> = {};

			tableBuilder.select = vi.fn(() => chain('select', table));
			tableBuilder.insert = vi.fn((payload: Record<string, unknown>) => {
				const c = chain('insert', table);
				captured[captured.length - 1].insertPayload = payload;
				return c;
			});
			tableBuilder.update = vi.fn((payload: Record<string, unknown>) => {
				const c = chain('update', table);
				captured[captured.length - 1].updatePayload = payload;
				return c;
			});

			return tableBuilder;
		})
	} as unknown as SupabaseClient;

	return { supabase, captured };
}

describe('createStore', () => {
	it('creates a store and a founding buyer_admin store_users row', async () => {
		const insertedStore = {
			id: 'store-1',
			business_name: 'Acme Apparel',
			website: null,
			phone: null,
			address_line1: null,
			address_line2: null,
			city: null,
			state: null,
			zip: null,
			country: null,
			onboarding_step: 0,
			onboarding_completed_at: null,
			created_at: '2026-04-17T12:00:00.000Z',
			updated_at: '2026-04-17T12:00:00.000Z'
		};
		const { supabase, captured } = makeMock({
			select: { data: null, error: null },
			insert: { data: insertedStore, error: null }
		});

		const result = await createStore(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel',
			displayName: 'Ada Rep'
		});

		expect(result).toEqual({ store: insertedStore });

		const inserts = captured.filter((c) => c.op === 'insert');
		expect(inserts).toHaveLength(2);

		const storeInsert = inserts.find((c) => c.table === 'stores');
		expect(storeInsert?.insertPayload).toEqual({ business_name: 'Acme Apparel' });

		const memberInsert = inserts.find((c) => c.table === 'store_users');
		expect(memberInsert?.insertPayload).toEqual({
			store_id: 'store-1',
			profile_id: 'user-1',
			role: 'buyer_admin'
		});

		// displayName was provided → profiles.display_name updated.
		const profileUpdate = captured.find((c) => c.op === 'update' && c.table === 'profiles');
		expect(profileUpdate?.updatePayload).toEqual({ display_name: 'Ada Rep' });
	});

	it('is idempotent: an existing store_users row short-circuits with zero inserts', async () => {
		const existingStore = {
			id: 'store-existing',
			business_name: 'Existing Store',
			created_at: '2026-01-01T00:00:00.000Z'
		};
		const { supabase, captured } = makeMock({
			select: { data: { stores: existingStore }, error: null }
		});

		const result = await createStore(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel'
		});

		expect(result).toEqual({ store: existingStore });
		expect(captured.filter((c) => c.op === 'insert')).toHaveLength(0);
		expect(captured.filter((c) => c.op === 'update')).toHaveLength(0);
	});

	it('rejects a blank/whitespace business name with 400 and touches the DB zero times', async () => {
		const { supabase, captured } = makeMock();

		const result = await createStore(supabase, {
			userId: 'user-1',
			businessName: '   '
		});

		expect(result).toEqual({ error: 'Business name is required', status: 400 });
		expect(supabase.from).not.toHaveBeenCalled();
		expect(captured).toHaveLength(0);
	});

	it('trims the business name before inserting', async () => {
		const insertedStore = { id: 'store-2', business_name: 'Trimmed Co' };
		const { supabase, captured } = makeMock({
			select: { data: null, error: null },
			insert: { data: insertedStore, error: null }
		});

		await createStore(supabase, {
			userId: 'user-1',
			businessName: '   Trimmed Co   '
		});

		const storeInsert = captured.find((c) => c.op === 'insert' && c.table === 'stores');
		expect(storeInsert?.insertPayload).toEqual({ business_name: 'Trimmed Co' });
	});

	it('surfaces a stores insert error as status 500 and skips the store_users insert', async () => {
		const { supabase, captured } = makeMock({
			select: { data: null, error: null },
			insert: { data: null, error: { message: 'stores insert failed' } }
		});

		const result = await createStore(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel'
		});

		expect(result).toEqual({ error: 'stores insert failed', status: 500 });

		const inserts = captured.filter((c) => c.op === 'insert');
		expect(inserts).toHaveLength(1);
		expect(inserts[0].table).toBe('stores');
	});

	it('surfaces a store_users insert error as status 500 after the store was created', async () => {
		const insertedStore = { id: 'store-3', business_name: 'Acme Apparel' };
		const { supabase, captured } = makeMock({
			select: { data: null, error: null },
			inserts: {
				stores: { data: insertedStore, error: null },
				store_users: { data: null, error: { message: 'store_users insert failed' } }
			}
		});

		const result = await createStore(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel'
		});

		expect(result).toEqual({ error: 'store_users insert failed', status: 500 });

		// The stores insert did happen; both inserts were attempted.
		const inserts = captured.filter((c) => c.op === 'insert');
		expect(inserts.map((c) => c.table)).toEqual(['stores', 'store_users']);
	});
});
