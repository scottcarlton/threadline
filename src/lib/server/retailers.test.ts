import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRetailer } from './retailers.js';

type Op = 'select' | 'insert' | 'update' | 'delete' | 'unknown';

type Captured = {
	op: Op;
	table: string;
	insertPayload?: Record<string, unknown>;
	updatePayload?: Record<string, unknown>;
	filters: Array<{ method: string; column: string; value: unknown }>;
};

type OpResponse = { data: unknown; error?: { message: string } | null };

/**
 * Chainable Supabase mock. Select responses are keyed by table so the two
 * distinct selects createRetailer issues — the idempotency check on
 * `organization_members` and the slug-collision check on `organizations` — can
 * return different data. Insert responses are likewise keyed by table.
 */
function makeMock({
	selects,
	inserts,
	update
}: {
	selects?: Record<string, OpResponse>;
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
				? (inserts?.[table] ?? { data: null, error: null })
				: op === 'update'
					? (update ?? { data: null, error: null })
					: op === 'delete'
						? { data: null, error: null }
						: (selects?.[table] ?? { data: null, error: null });

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
			tableBuilder.delete = vi.fn(() => chain('delete', table));

			return tableBuilder;
		})
	} as unknown as SupabaseClient;

	return { supabase, captured };
}

describe('createRetailer', () => {
	it('creates a retailer org and a founding admin membership, no self-brand seeded', async () => {
		const insertedOrg = {
			id: 'org-1',
			name: 'Acme Apparel',
			slug: 'acme-apparel',
			org_type: 'retailer',
			onboarding_completed_at: '2026-07-10T12:00:00.000Z',
			created_at: '2026-07-10T12:00:00.000Z'
		};
		const { supabase, captured } = makeMock({
			selects: {
				organization_members: { data: null, error: null },
				organizations: { data: null, error: null }
			},
			inserts: {
				organizations: { data: insertedOrg, error: null },
				organization_members: { data: null, error: null }
			}
		});

		const result = await createRetailer(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel',
			displayName: 'Ada Buyer'
		});

		expect(result).toEqual({ organization: insertedOrg });

		const inserts = captured.filter((c) => c.op === 'insert');
		expect(inserts.map((c) => c.table)).toEqual(['organizations', 'organization_members']);

		// Completion is atomic with creation: onboarding_completed_at is in the INSERT.
		const orgInsert = inserts.find((c) => c.table === 'organizations');
		expect(orgInsert?.insertPayload).toMatchObject({
			name: 'Acme Apparel',
			slug: 'acme-apparel',
			org_type: 'retailer'
		});
		expect(typeof orgInsert?.insertPayload?.onboarding_completed_at).toBe('string');

		const memberInsert = inserts.find((c) => c.table === 'organization_members');
		expect(memberInsert?.insertPayload).toMatchObject({
			organization_id: 'org-1',
			profile_id: 'user-1',
			role: 'admin'
		});
		expect(typeof memberInsert?.insertPayload?.accepted_at).toBe('string');

		// Nothing brand-only was touched.
		expect(captured.some((c) => c.table === 'brands')).toBe(false);
		expect(captured.some((c) => c.table === 'seasons')).toBe(false);
		expect(captured.some((c) => c.table === 'organization_shipping_methods')).toBe(false);

		// displayName provided → profiles.display_name updated, AFTER org + member.
		const profileUpdate = captured.find((c) => c.op === 'update' && c.table === 'profiles');
		expect(profileUpdate?.updatePayload).toEqual({ display_name: 'Ada Buyer' });
		const profileIdx = captured.findIndex((c) => c.op === 'update' && c.table === 'profiles');
		const memberIdx = captured.findIndex(
			(c) => c.op === 'insert' && c.table === 'organization_members'
		);
		expect(profileIdx).toBeGreaterThan(memberIdx);
	});

	it('is idempotent: an existing retailer-org membership short-circuits with zero writes', async () => {
		const existingOrg = {
			id: 'org-existing',
			name: 'Existing Retailer',
			slug: 'existing-retailer',
			org_type: 'retailer'
		};
		const { supabase, captured } = makeMock({
			selects: {
				organization_members: { data: { organizations: existingOrg }, error: null }
			}
		});

		const result = await createRetailer(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel'
		});

		expect(result).toEqual({ organization: existingOrg });
		expect(captured.filter((c) => c.op === 'insert')).toHaveLength(0);
		expect(captured.filter((c) => c.op === 'update')).toHaveLength(0);
		expect(captured.filter((c) => c.op === 'delete')).toHaveLength(0);

		// The idempotency lookup filters org_type='retailer' SERVER-SIDE.
		const idempotencyQuery = captured.find(
			(c) => c.op === 'select' && c.table === 'organization_members'
		);
		expect(idempotencyQuery?.filters).toContainEqual({
			method: 'eq',
			column: 'organizations.org_type',
			value: 'retailer'
		});
	});

	it('creates a NEW retailer org for a user who admins only a rep org (server-side filter excludes it)', async () => {
		// A rep-admin user has no RETAILER membership, so the org_type-filtered
		// idempotency query returns nothing — createRetailer must mint a retailer
		// org, never return the rep org.
		const insertedOrg = {
			id: 'retailer-new',
			name: 'Acme Apparel',
			slug: 'acme-apparel',
			org_type: 'retailer'
		};
		const { supabase, captured } = makeMock({
			selects: {
				organization_members: { data: null, error: null },
				organizations: { data: null, error: null }
			},
			inserts: {
				organizations: { data: insertedOrg, error: null },
				organization_members: { data: null, error: null }
			}
		});

		const result = await createRetailer(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel'
		});

		expect(result).toEqual({ organization: insertedOrg });
		expect(captured.filter((c) => c.op === 'insert').map((c) => c.table)).toEqual([
			'organizations',
			'organization_members'
		]);
	});

	it('rejects a blank/whitespace business name with 400 and touches the DB zero times', async () => {
		const { supabase, captured } = makeMock();

		const result = await createRetailer(supabase, {
			userId: 'user-1',
			businessName: '   '
		});

		expect(result).toEqual({ error: 'Business name is required', status: 400 });
		expect(supabase.from).not.toHaveBeenCalled();
		expect(captured).toHaveLength(0);
	});

	it('trims the business name and slugifies it before inserting', async () => {
		const insertedOrg = {
			id: 'org-3',
			name: 'Trimmed Co',
			slug: 'trimmed-co',
			org_type: 'retailer'
		};
		const { supabase, captured } = makeMock({
			selects: {
				organization_members: { data: null, error: null },
				organizations: { data: null, error: null }
			},
			inserts: {
				organizations: { data: insertedOrg, error: null },
				organization_members: { data: null, error: null }
			}
		});

		await createRetailer(supabase, {
			userId: 'user-1',
			businessName: '   Trimmed Co   '
		});

		const orgInsert = captured.find((c) => c.op === 'insert' && c.table === 'organizations');
		expect(orgInsert?.insertPayload).toMatchObject({
			name: 'Trimmed Co',
			slug: 'trimmed-co',
			org_type: 'retailer'
		});
	});

	it('rejects a slug collision with 409 and inserts nothing', async () => {
		const { supabase, captured } = makeMock({
			selects: {
				organization_members: { data: null, error: null },
				organizations: { data: { id: 'taken-org' }, error: null }
			}
		});

		const result = await createRetailer(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel'
		});

		expect(result).toEqual({
			error: 'That organization name is taken. Please pick another.',
			status: 409
		});
		expect(captured.filter((c) => c.op === 'insert')).toHaveLength(0);
	});

	it('surfaces an organizations insert error as status 500 and skips the membership insert', async () => {
		const { supabase, captured } = makeMock({
			selects: {
				organization_members: { data: null, error: null },
				organizations: { data: null, error: null }
			},
			inserts: {
				organizations: { data: null, error: { message: 'organizations insert failed' } }
			}
		});

		const result = await createRetailer(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel'
		});

		expect(result).toEqual({ error: 'organizations insert failed', status: 500 });

		const inserts = captured.filter((c) => c.op === 'insert');
		expect(inserts).toHaveLength(1);
		expect(inserts[0].table).toBe('organizations');
	});

	it('rolls back the org (delete) when the membership insert fails, freeing the slug', async () => {
		const insertedOrg = {
			id: 'org-4',
			name: 'Acme Apparel',
			slug: 'acme-apparel',
			org_type: 'retailer'
		};
		const { supabase, captured } = makeMock({
			selects: {
				organization_members: { data: null, error: null },
				organizations: { data: null, error: null }
			},
			inserts: {
				organizations: { data: insertedOrg, error: null },
				organization_members: { data: null, error: { message: 'members insert failed' } }
			}
		});

		const result = await createRetailer(supabase, {
			userId: 'user-1',
			businessName: 'Acme Apparel',
			displayName: 'Ada Buyer'
		});

		expect(result).toEqual({ error: 'members insert failed', status: 500 });

		const inserts = captured.filter((c) => c.op === 'insert');
		expect(inserts.map((c) => c.table)).toEqual(['organizations', 'organization_members']);

		// The orphan org is deleted so it doesn't hold the slug forever.
		const del = captured.find((c) => c.op === 'delete' && c.table === 'organizations');
		expect(del).toBeDefined();
		expect(del?.filters).toContainEqual({ method: 'eq', column: 'id', value: 'org-4' });

		// display_name is written only on success — never on a rolled-back attempt.
		expect(captured.some((c) => c.op === 'update' && c.table === 'profiles')).toBe(false);
	});
});
