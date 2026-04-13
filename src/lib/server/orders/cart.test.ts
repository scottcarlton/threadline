import { describe, it, expect } from 'vitest';
import {
	groupCart,
	buildOrders,
	validateCart,
	CartValidationError,
	type CartLine,
	type CartContext
} from './cart.js';

const line = (
	brand_id: string,
	season_id: string,
	qty = 2,
	unit_price = 10,
	style = 'S1'
): CartLine => ({
	product_id: null,
	brand_id,
	season_id,
	style_number: style,
	description: null,
	color: 'Black',
	size: 'M',
	qty,
	unit_price
});

const ctx = (overrides: Partial<CartContext> = {}): CartContext => ({
	type: 'order',
	account_id: 'acct-1',
	freeform_name: null,
	order_year: 2026,
	...overrides
});

describe('groupCart', () => {
	it('returns one group for one (brand, season)', () => {
		const groups = groupCart([line('B1', 'S1'), line('B1', 'S1', 1, 5)]);
		expect(groups).toHaveLength(1);
		expect(groups[0].lines).toHaveLength(2);
		expect(groups[0].total).toBe(2 * 10 + 1 * 5);
	});

	it('splits into N groups for N (brand, season) pairs', () => {
		const groups = groupCart([
			line('B1', 'S1'),
			line('B1', 'S2'),
			line('B2', 'S1'),
			line('B2', 'S2')
		]);
		expect(groups).toHaveLength(4);
	});

	it('drops zero-qty lines', () => {
		const groups = groupCart([line('B1', 'S1', 0), line('B1', 'S1', 3)]);
		expect(groups).toHaveLength(1);
		expect(groups[0].lines).toHaveLength(1);
		expect(groups[0].lines[0].qty).toBe(3);
	});

	it('preserves first-seen order of groups', () => {
		const groups = groupCart([line('B2', 'S1'), line('B1', 'S1'), line('B2', 'S1', 1)]);
		expect(groups.map((g) => g.brand_id)).toEqual(['B2', 'B1']);
	});
});

describe('buildOrders', () => {
	it('produces one NewOrder per group with totals + status', () => {
		const groups = groupCart([line('B1', 'S1'), line('B1', 'S2')]);
		const orders = buildOrders(groups, ctx(), 'submitted');
		expect(orders).toHaveLength(2);
		expect(orders[0].status).toBe('submitted');
		expect(orders[0].brand_id).toBe('B1');
		expect(orders[0].season_id).toBe('S1');
		expect(orders[0].total_amount).toBe(20);
		expect(orders[0].lines).toHaveLength(1);
		expect(orders[0].lines[0]).not.toHaveProperty('brand_id');
	});

	it('forces all orders to draft when freeform (account_id null)', () => {
		const groups = groupCart([line('B1', 'S1')]);
		const orders = buildOrders(
			groups,
			ctx({ account_id: null, freeform_name: 'Joe Buyer' }),
			'submitted'
		);
		expect(orders[0].status).toBe('draft');
		expect(orders[0].freeform_name).toBe('Joe Buyer');
		expect(orders[0].account_id).toBeNull();
	});

	it('passes through delivery choice', () => {
		const groups = groupCart([line('B1', 'S1')]);
		groups[0].delivery = { kind: 'delivery', delivery_id: 'd-1' };
		expect(buildOrders(groups, ctx())[0].delivery_id).toBe('d-1');

		groups[0].delivery = {
			kind: 'custom',
			start_ship_date: '2026-05-15',
			expected_ship_date: '2026-06-01'
		};
		const built = buildOrders(groups, ctx());
		expect(built[0].delivery_id).toBeNull();
		expect(built[0].expected_ship_date).toBe('2026-06-01');
		expect(built[0].start_ship_date).toBe('2026-05-15');
	});

	it('passes through location_id per group', () => {
		const groups = groupCart([line('B1', 'S1'), line('B1', 'S2')]);
		groups[0].location_id = 'loc-A';
		groups[1].location_id = 'loc-B';
		const built = buildOrders(groups, ctx());
		expect(built[0].location_id).toBe('loc-A');
		expect(built[1].location_id).toBe('loc-B');
	});
});

describe('validateCart', () => {
	it('rejects an empty cart', () => {
		expect(() => validateCart([], ctx(), 'draft')).toThrow(CartValidationError);
	});

	it('rejects a note with zero lines', () => {
		expect(() => validateCart([], ctx({ type: 'note' }), 'draft')).toThrow(
			/note needs at least one item/i
		);
	});

	it('rejects neither account nor freeform', () => {
		const groups = groupCart([line('B1', 'S1')]);
		expect(() =>
			validateCart(groups, ctx({ account_id: null, freeform_name: null }), 'draft')
		).toThrow(/account or enter a freeform/i);
	});

	it('rejects freeform submitting past draft', () => {
		const groups = groupCart([line('B1', 'S1')]);
		expect(() =>
			validateCart(groups, ctx({ account_id: null, freeform_name: 'X' }), 'submitted')
		).toThrow(/freeform/i);
	});

	it('passes a valid order cart', () => {
		const groups = groupCart([line('B1', 'S1')]);
		expect(() => validateCart(groups, ctx(), 'submitted')).not.toThrow();
	});
});
