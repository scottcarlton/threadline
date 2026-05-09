import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	getOrCreateConnectInvite,
	refreshConnectInvite,
	shareConnectInvite,
	recordConnectInviteUse
} from './connections.js';

type Op = 'select' | 'insert' | 'update' | 'unknown';

type Captured = {
	op: Op;
	insertPayload?: Record<string, unknown>;
	updatePayload?: Record<string, unknown>;
	filters: Array<{ method: string; column: string; value: unknown }>;
};

type SelectResponse = { data: unknown; error?: { message: string } | null };
type InsertResponse = SelectResponse;
type UpdateResponse = SelectResponse;

function makeMock({
	select,
	insert,
	update
}: {
	select?: SelectResponse;
	insert?: InsertResponse;
	update?: UpdateResponse;
} = {}) {
	const captured: Captured[] = [];

	function chain(op: Op): Record<string, unknown> {
		const rec: Captured = { op, filters: [] };
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
				? (insert ?? { data: null, error: null })
				: op === 'update'
					? (update ?? { data: null, error: null })
					: (select ?? { data: null, error: null });

		builder.single = vi.fn().mockResolvedValue(response);
		builder.maybeSingle = vi.fn().mockResolvedValue(response);
		(builder as { then: unknown }).then = (resolve: (v: SelectResponse) => void) =>
			resolve(response);

		return builder;
	}

	const supabase = {
		from: vi.fn(() => {
			let currentOp: Op = 'unknown';
			const tableBuilder: Record<string, unknown> = {};

			tableBuilder.select = vi.fn(() => {
				currentOp = 'select';
				const c = chain('select');
				return c;
			});
			tableBuilder.insert = vi.fn((payload: Record<string, unknown>) => {
				currentOp = 'insert';
				const c = chain('insert');
				captured[captured.length - 1].insertPayload = payload;
				return c;
			});
			tableBuilder.update = vi.fn((payload: Record<string, unknown>) => {
				currentOp = 'update';
				const c = chain('update');
				captured[captured.length - 1].updatePayload = payload;
				return c;
			});

			void currentOp;
			return tableBuilder;
		})
	} as unknown as SupabaseClient;

	return { supabase, captured };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('getOrCreateConnectInvite', () => {
	it('returns the existing row for a brand org without inserting', async () => {
		const existing = {
			id: 'invite-1',
			code: 'abc',
			use_count: 3,
			last_used_at: '2026-04-10T00:00:00.000Z',
			created_at: '2026-04-01T00:00:00.000Z'
		};
		const { supabase, captured } = makeMock({ select: { data: existing, error: null } });

		const result = await getOrCreateConnectInvite(supabase, 'brand-org-1', 'user-1');

		expect(result).toEqual(existing);
		expect(captured.filter((c) => c.op === 'insert')).toHaveLength(0);
	});

	it('creates one if missing (defensive)', async () => {
		const inserted = {
			id: 'invite-new',
			code: 'def',
			use_count: 0,
			last_used_at: null,
			created_at: '2026-04-17T12:00:00.000Z'
		};
		const { supabase, captured } = makeMock({
			select: { data: null, error: null },
			insert: { data: inserted, error: null }
		});

		const result = await getOrCreateConnectInvite(supabase, 'brand-org-1', 'user-1');

		expect(result).toEqual(inserted);
		const insertOps = captured.filter((c) => c.op === 'insert');
		expect(insertOps).toHaveLength(1);
		const payload = insertOps[0].insertPayload as Record<string, unknown>;
		expect(payload.brand_org_id).toBe('brand-org-1');
		expect(payload.created_by).toBe('user-1');
		expect(payload.expires_at).toBeNull();
		expect(payload.max_uses).toBe(0);
		expect(typeof payload.code).toBe('string');
		expect((payload.code as string).length).toBe(32);
	});
});

describe('refreshConnectInvite', () => {
	it('rotates code, resets counters, invalidates old code', async () => {
		const updated = {
			id: 'invite-1',
			code: 'rotated',
			use_count: 0,
			last_used_at: null,
			created_at: '2026-04-01T00:00:00.000Z'
		};
		const { supabase, captured } = makeMock({ update: { data: updated, error: null } });

		const result = await refreshConnectInvite(supabase, 'brand-org-1');

		expect(result).toEqual(updated);
		const updateOps = captured.filter((c) => c.op === 'update');
		expect(updateOps).toHaveLength(1);
		const payload = updateOps[0].updatePayload as Record<string, unknown>;
		expect(payload.use_count).toBe(0);
		expect(payload.last_used_at).toBeNull();
		expect(typeof payload.code).toBe('string');
		expect((payload.code as string).length).toBe(32);
		expect(updateOps[0].filters).toEqual(
			expect.arrayContaining([{ method: 'eq', column: 'brand_org_id', value: 'brand-org-1' }])
		);
	});
});

describe('recordConnectInviteUse', () => {
	it('increments use_count and stamps last_used_at on a known code', async () => {
		const { supabase, captured } = makeMock({
			select: { data: { id: 'invite-1', use_count: 4 }, error: null }
		});

		await recordConnectInviteUse(supabase, 'good-code');

		const updateOps = captured.filter((c) => c.op === 'update');
		expect(updateOps).toHaveLength(1);
		const payload = updateOps[0].updatePayload as Record<string, unknown>;
		expect(payload.use_count).toBe(5);
		expect(payload.last_used_at).toBe('2026-04-17T12:00:00.000Z');
		expect(updateOps[0].filters).toEqual(
			expect.arrayContaining([{ method: 'eq', column: 'id', value: 'invite-1' }])
		);
	});

	it('is a no-op for an unknown code', async () => {
		const { supabase, captured } = makeMock({ select: { data: null, error: null } });

		await recordConnectInviteUse(supabase, 'unknown-code');

		expect(captured.filter((c) => c.op === 'update')).toHaveLength(0);
	});
});

describe('shareConnectInvite', () => {
	const baseInvite = {
		id: 'invite-1',
		code: 'rotated-abc',
		use_count: 0,
		last_used_at: null,
		created_at: '2026-04-01T00:00:00.000Z',
		commission_rate: 10
	};

	it('clamps negative rates to 0', async () => {
		const { supabase, captured } = makeMock({
			update: { data: { ...baseInvite, commission_rate: 0 }, error: null }
		});

		const result = await shareConnectInvite(supabase, 'brand-org-1', -5);

		const updateOps = captured.filter((c) => c.op === 'update');
		expect(updateOps).toHaveLength(1);
		expect((updateOps[0].updatePayload as Record<string, unknown>).commission_rate).toBe(0);
		expect(result.commission_rate).toBe(0);
	});

	it('clamps rates above 100 to 100', async () => {
		const { supabase, captured } = makeMock({
			update: { data: { ...baseInvite, commission_rate: 100 }, error: null }
		});

		const result = await shareConnectInvite(supabase, 'brand-org-1', 150);

		const updateOps = captured.filter((c) => c.op === 'update');
		expect((updateOps[0].updatePayload as Record<string, unknown>).commission_rate).toBe(100);
		expect(result.commission_rate).toBe(100);
	});

	it('coerces NaN to 0', async () => {
		const { supabase, captured } = makeMock({
			update: { data: { ...baseInvite, commission_rate: 0 }, error: null }
		});

		await shareConnectInvite(supabase, 'brand-org-1', NaN);

		const updateOps = captured.filter((c) => c.op === 'update');
		expect((updateOps[0].updatePayload as Record<string, unknown>).commission_rate).toBe(0);
	});

	it('sets max_uses = 1, use_count = 0, last_used_at = null', async () => {
		const { supabase, captured } = makeMock({
			update: { data: baseInvite, error: null }
		});

		await shareConnectInvite(supabase, 'brand-org-1', 12);

		const payload = captured.filter((c) => c.op === 'update')[0].updatePayload as Record<
			string,
			unknown
		>;
		expect(payload.max_uses).toBe(1);
		expect(payload.use_count).toBe(0);
		expect(payload.last_used_at).toBeNull();
	});

	it('passes through a valid rate', async () => {
		const { supabase, captured } = makeMock({
			update: { data: { ...baseInvite, commission_rate: 12.5 }, error: null }
		});

		const result = await shareConnectInvite(supabase, 'brand-org-1', 12.5);

		const payload = captured.filter((c) => c.op === 'update')[0].updatePayload as Record<
			string,
			unknown
		>;
		expect(payload.commission_rate).toBe(12.5);
		expect(result.commission_rate).toBe(12.5);
	});

	it('rotates the code (generates a new 32-char hex)', async () => {
		const { supabase, captured } = makeMock({
			update: { data: baseInvite, error: null }
		});

		await shareConnectInvite(supabase, 'brand-org-1', 10);

		const payload = captured.filter((c) => c.op === 'update')[0].updatePayload as Record<
			string,
			unknown
		>;
		expect(typeof payload.code).toBe('string');
		expect((payload.code as string).length).toBe(32);
	});

	it('filters by brand_org_id', async () => {
		const { supabase, captured } = makeMock({
			update: { data: baseInvite, error: null }
		});

		await shareConnectInvite(supabase, 'brand-org-42', 10);

		const updateOps = captured.filter((c) => c.op === 'update');
		expect(updateOps[0].filters).toEqual(
			expect.arrayContaining([{ method: 'eq', column: 'brand_org_id', value: 'brand-org-42' }])
		);
	});

	it('throws on supabase error', async () => {
		const { supabase } = makeMock({
			update: { data: null, error: { message: 'DB error' } }
		});

		await expect(shareConnectInvite(supabase, 'org-1', 10)).rejects.toEqual({
			message: 'DB error'
		});
	});
});
