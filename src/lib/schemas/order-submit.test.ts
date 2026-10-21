import { describe, expect, it } from 'vitest';
import { submitPayloadSchema } from './order-submit';

const brand = 'b0000000-0000-4000-8000-000000000001';
const product = 'b0d00000-0000-4000-8000-000000000001';
const account = 'ac000000-0000-4000-8000-000000000001';

const line = (over: Record<string, unknown> = {}) => ({
	product_id: product,
	brand_id: brand,
	season_id: null,
	style_number: 'ST-1',
	description: 'Tee',
	color: 'Black',
	size: 'M',
	qty: 2,
	unit_price: 10,
	...over
});

const base = (over: Record<string, unknown> = {}) => ({
	type: 'order',
	account_id: account,
	freeform_name: null,
	order_year: 2026,
	submitStatus: 'submitted',
	payment_preference: null,
	lines: [line()],
	groups: [{ brand_id: brand, season_id: null, delivery: null, location_id: null }],
	...over
});

describe('submitPayloadSchema', () => {
	it('accepts the payload the order wizard sends today', () => {
		expect(submitPayloadSchema.safeParse(base()).success).toBe(true);
	});

	it.each(['preparing', 'shipped', 'delivered', 'cancelled'])(
		'rejects creating an order already in %s',
		(status) => {
			expect(submitPayloadSchema.safeParse(base({ submitStatus: status })).success).toBe(false);
		}
	);

	it('rejects a line without a product', () => {
		expect(
			submitPayloadSchema.safeParse(base({ lines: [line({ product_id: null })] })).success
		).toBe(false);
	});

	it.each([0, -1, 1.5])('rejects quantity %s', (qty) => {
		expect(submitPayloadSchema.safeParse(base({ lines: [line({ qty })] })).success).toBe(false);
	});

	it('rejects an empty cart', () => {
		expect(submitPayloadSchema.safeParse(base({ lines: [] })).success).toBe(false);
	});

	it('rejects non-uuid ids', () => {
		expect(submitPayloadSchema.safeParse(base({ account_id: 'acct-1' })).success).toBe(false);
	});

	it('accepts a custom delivery window with ISO dates and rejects other formats', () => {
		const custom = (start: string) => ({
			brand_id: brand,
			season_id: null,
			delivery: { kind: 'custom', start_ship_date: start, expected_ship_date: '2026-11-30' },
			location_id: null
		});
		expect(submitPayloadSchema.safeParse(base({ groups: [custom('2026-11-01')] })).success).toBe(
			true
		);
		expect(submitPayloadSchema.safeParse(base({ groups: [custom('11/01/2026')] })).success).toBe(
			false
		);
	});

	it('trims freeform details and requires a business name', () => {
		const ok = submitPayloadSchema.safeParse(
			base({ account_id: null, freeformDetails: { business_name: '  New Store  ' } })
		);
		expect(ok.success && ok.data.freeformDetails?.business_name).toBe('New Store');
		expect(
			submitPayloadSchema.safeParse(
				base({ account_id: null, freeformDetails: { business_name: ' ' } })
			).success
		).toBe(false);
	});
});
