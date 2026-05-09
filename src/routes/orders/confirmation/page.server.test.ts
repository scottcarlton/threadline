import { describe, expect, it, vi } from 'vitest';

type OrderRow = {
	id: string;
	order_number: string;
	order_type: 'order' | 'note';
	status: string;
	total_amount: number;
	submitted_at: string | null;
	created_at: string | null;
	start_ship_date: string | null;
	expected_ship_date: string | null;
	order_year: number | null;
	payment_preference: string | null;
	payment_terms: string | null;
	accounts: { business_name: string | null; contact_email: string | null } | null;
	brands: { name: string | null } | null;
	seasons: { name: string | null } | null;
	account_locations: { label: string | null; city: string | null; state: string | null } | null;
	order_lines: Array<{ qty: number }>;
};

const makeRow = (over: Partial<OrderRow> = {}): OrderRow => ({
	id: crypto.randomUUID(),
	order_number: 'BLM-000001',
	order_type: 'order',
	status: 'submitted',
	total_amount: 1000,
	submitted_at: '2026-04-21T15:42:00Z',
	created_at: '2026-04-21T15:42:00Z',
	start_ship_date: '2026-07-15',
	expected_ship_date: '2026-08-30',
	order_year: 2026,
	payment_preference: 'credit_card',
	payment_terms: 'net_30',
	accounts: { business_name: 'Bloom Boutique', contact_email: 'buyer@example.com' },
	brands: { name: 'Catherine Gee' },
	seasons: { name: 'Fall' },
	account_locations: { label: 'Primary', city: 'Denver', state: 'CO' },
	order_lines: [{ qty: 5 }, { qty: 3 }],
	...over
});

let mockRows: OrderRow[] = [];

vi.mock('$lib/server/supabase.js', () => ({
	supabaseAdmin: {
		from: () => ({
			select: () => ({
				eq: () => ({
					in: async (_col: string, numbers: string[]) => ({
						data: mockRows.filter((r) => numbers.includes(r.order_number)),
						error: null
					})
				})
			})
		})
	}
}));

const { load } = await import('./+page.server');

const TEST_ORG_ID = 'org-test-123';

type LoadResult = {
	order_type: 'order' | 'note';
	count: number;
	total: number;
	unitCount: number;
	brandCount: number;
	buyerEmail: string | null;
	accountName: string | null;
	createdAt: string | null;
	rows: Array<{
		order_number: string;
		brand_name: string;
		season_label: string;
		units: number;
		total: number;
		ship_window: string;
		location_summary: string;
		payment_summary: string;
	}>;
};

function call(idsParam: string | null, rows: OrderRow[] = []) {
	mockRows = rows;
	const url = new URL('http://localhost/orders/confirmation');
	if (idsParam !== null) url.searchParams.set('ids', idsParam);
	const event = {
		url,
		locals: {
			organization: { id: TEST_ORG_ID }
		}
	};
	return load(event as unknown as Parameters<typeof load>[0]);
}

async function callOk(idsParam: string, rows: OrderRow[] = []): Promise<LoadResult> {
	const result = await Promise.resolve(call(idsParam, rows));
	if (!result) throw new Error('Expected load to return data, not redirect');
	return result as LoadResult;
}

async function catchThrown<T>(value: T | Promise<T>): Promise<unknown> {
	try {
		await Promise.resolve(value);
		return null;
	} catch (err) {
		return err;
	}
}

describe('orders/confirmation load', () => {
	it('redirects to /orders when ids is missing', async () => {
		const thrown = (await catchThrown(call(null))) as { status?: number; location?: string };
		expect(thrown?.status).toBe(303);
		expect(thrown?.location).toBe('/orders');
	});

	it('redirects to /orders when ids is empty', async () => {
		const thrown = (await catchThrown(call(''))) as { status?: number; location?: string };
		expect(thrown?.status).toBe(303);
		expect(thrown?.location).toBe('/orders');
	});

	it('redirects when ids is just whitespace/commas', async () => {
		const thrown = (await catchThrown(call(', , ,'))) as {
			status?: number;
			location?: string;
		};
		expect(thrown?.status).toBe(303);
		expect(thrown?.location).toBe('/orders');
	});

	it('404s when RLS filters a row out (fewer rows than requested)', async () => {
		const thrown = (await catchThrown(
			call('BLM-000001,BLM-000002', [makeRow({ order_number: 'BLM-000001' })])
		)) as { status?: number };
		expect(thrown?.status).toBe(404);
	});

	it('404s when rows have mixed order_type', async () => {
		const thrown = (await catchThrown(
			call('BLM-000001,BLM-000002', [
				makeRow({ order_number: 'BLM-000001', order_type: 'order' }),
				makeRow({ order_number: 'BLM-000002', order_type: 'note' })
			])
		)) as { status?: number };
		expect(thrown?.status).toBe(404);
	});

	it('404s when no rows are returned at all', async () => {
		const thrown = (await catchThrown(call('BLM-UNKNOWN', []))) as { status?: number };
		expect(thrown?.status).toBe(404);
	});

	it('truncates silently to the first 10 ids', async () => {
		const numbers = Array.from({ length: 12 }, (_, i) => `BLM-${String(i + 1).padStart(6, '0')}`);
		const rows = numbers.slice(0, 10).map((n) => makeRow({ order_number: n }));
		const result = await callOk(numbers.join(','), rows);
		expect(result.count).toBe(10);
	});

	it('dedupes repeated ids before querying', async () => {
		const rows = [makeRow({ order_number: 'BLM-000001' })];
		const result = await callOk('BLM-000001,BLM-000001,BLM-000001', rows);
		expect(result.count).toBe(1);
	});

	it('returns the expected aggregate shape for a multi-order cart', async () => {
		const rows = [
			makeRow({
				order_number: 'BLM-000001',
				brands: { name: 'Catherine Gee' },
				total_amount: 1200,
				order_lines: [{ qty: 10 }]
			}),
			makeRow({
				order_number: 'BLM-000002',
				brands: { name: 'Atelier Rose' },
				total_amount: 800,
				order_lines: [{ qty: 5 }]
			})
		];
		const result = await callOk('BLM-000001,BLM-000002', rows);
		expect(result.order_type).toBe('order');
		expect(result.count).toBe(2);
		expect(result.total).toBe(2000);
		expect(result.unitCount).toBe(15);
		expect(result.brandCount).toBe(2);
		expect(result.accountName).toBe('Bloom Boutique');
		expect(result.buyerEmail).toBe('buyer@example.com');
		expect(result.rows.map((r) => r.order_number)).toEqual(['BLM-000001', 'BLM-000002']);
		expect(result.rows[0].season_label).toBe('Fall 2026');
		expect(result.rows[0].payment_summary).toBe('Credit Card · Net 30');
		expect(result.rows[0].ship_window).toBe('Jul 15 – Aug 30');
		expect(result.rows[0].location_summary).toBe('Primary · Denver, CO');
	});

	it('preserves the caller-supplied id order even when the DB returns them differently', async () => {
		const rows = [makeRow({ order_number: 'BLM-000002' }), makeRow({ order_number: 'BLM-000001' })];
		const result = await callOk('BLM-000001,BLM-000002', rows);
		expect(result.rows.map((r) => r.order_number)).toEqual(['BLM-000001', 'BLM-000002']);
	});

	it('returns order_type note when all rows are notes', async () => {
		const rows = [
			makeRow({ order_number: 'BLM-000001', order_type: 'note', status: 'draft' }),
			makeRow({ order_number: 'BLM-000002', order_type: 'note', status: 'draft' })
		];
		const result = await callOk('BLM-000001,BLM-000002', rows);
		expect(result.order_type).toBe('note');
	});
});
