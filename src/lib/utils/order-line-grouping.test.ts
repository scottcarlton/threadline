import { describe, expect, it } from 'vitest';
import {
	groupLinesByStyleColor,
	type ActiveOrderLine,
	type ProductMeta
} from './order-line-grouping.js';

function line(overrides: Partial<ActiveOrderLine>): ActiveOrderLine {
	return {
		id: 'l1',
		product_id: 'p1',
		style_number: 'STYLE-1',
		description: 'Shirt',
		color: 'Natural',
		size: 'M',
		qty: 1,
		unit_price: 100,
		original_qty: null,
		...overrides
	};
}

function meta(overrides: Partial<ProductMeta> = {}): ProductMeta {
	return {
		primary_image_id: null,
		colors: [],
		sizes: [],
		season_name: null,
		season_year: null,
		...overrides
	};
}

describe('groupLinesByStyleColor', () => {
	it('returns an empty array for no input', () => {
		expect(groupLinesByStyleColor([], {})).toEqual([]);
	});

	it('groups a single line into a single row', () => {
		const rows = groupLinesByStyleColor([line({})], { p1: meta() });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			key: 'p1|Natural',
			product_id: 'p1',
			style_number: 'STYLE-1',
			name: 'Shirt',
			color: 'Natural',
			units: 1,
			total: 100
		});
		expect(rows[0].lines).toEqual([{ id: 'l1', size: 'M', qty: 1, original_qty: null }]);
	});

	it('groups multiple lines of the same (product, color) together', () => {
		const rows = groupLinesByStyleColor(
			[
				line({ id: 'l1', size: 'S', qty: 2 }),
				line({ id: 'l2', size: 'M', qty: 3 }),
				line({ id: 'l3', size: 'L', qty: 1 })
			],
			{ p1: meta() }
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].units).toBe(6);
		expect(rows[0].total).toBe(600);
		expect(rows[0].lines.map((l) => l.size)).toEqual(['S', 'M', 'L']);
	});

	it('splits distinct colors of the same product into separate rows', () => {
		const rows = groupLinesByStyleColor(
			[line({ id: 'l1', color: 'Natural', qty: 1 }), line({ id: 'l2', color: 'Black', qty: 2 })],
			{ p1: meta() }
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.color)).toEqual(['Natural', 'Black']);
		expect(rows[0].units).toBe(1);
		expect(rows[1].units).toBe(2);
	});

	it('splits distinct products into separate rows', () => {
		const rows = groupLinesByStyleColor(
			[
				line({ id: 'l1', product_id: 'p1', style_number: 'S-1' }),
				line({ id: 'l2', product_id: 'p2', style_number: 'S-2' })
			],
			{ p1: meta(), p2: meta() }
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.product_id)).toEqual(['p1', 'p2']);
	});

	it('excludes lines without a product_id (custom lines are rendered separately)', () => {
		const rows = groupLinesByStyleColor(
			[
				line({ id: 'l1', product_id: 'p1' }),
				line({ id: 'l2', product_id: null, style_number: 'CUSTOM' })
			],
			{ p1: meta() }
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].product_id).toBe('p1');
	});

	it('populates season_label when season_name + season_year are present', () => {
		const rows = groupLinesByStyleColor([line({})], {
			p1: meta({ season_name: 'Fall', season_year: 2026 })
		});
		expect(rows[0].season_label).toBe('Fall 2026');
	});

	it('falls back to season_name only when season_year is missing', () => {
		const rows = groupLinesByStyleColor([line({})], {
			p1: meta({ season_name: 'Fall', season_year: null })
		});
		expect(rows[0].season_label).toBe('Fall');
	});

	it('returns null season_label when no season metadata is present', () => {
		const rows = groupLinesByStyleColor([line({})], { p1: meta() });
		expect(rows[0].season_label).toBeNull();
	});

	it('falls back to style_number when description is missing', () => {
		const rows = groupLinesByStyleColor([line({ description: null })], { p1: meta() });
		expect(rows[0].name).toBe('STYLE-1');
	});

	it('carries the available colors and sizes from product metadata', () => {
		const rows = groupLinesByStyleColor([line({})], {
			p1: meta({ colors: ['Natural', 'Black'], sizes: ['XS', 'S', 'M', 'L', 'XL'] })
		});
		expect(rows[0].available_colors).toEqual(['Natural', 'Black']);
		expect(rows[0].available_sizes).toEqual(['XS', 'S', 'M', 'L', 'XL']);
	});

	it('preserves first-seen order across inputs', () => {
		const rows = groupLinesByStyleColor(
			[
				line({ id: 'l1', product_id: 'p2', style_number: 'B' }),
				line({ id: 'l2', product_id: 'p1', style_number: 'A' }),
				line({ id: 'l3', product_id: 'p2', style_number: 'B', size: 'L' })
			],
			{ p1: meta(), p2: meta() }
		);
		expect(rows.map((r) => r.product_id)).toEqual(['p2', 'p1']);
	});

	it('handles null color as its own bucket', () => {
		const rows = groupLinesByStyleColor(
			[line({ id: 'l1', color: 'Natural' }), line({ id: 'l2', color: null })],
			{ p1: meta() }
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.color)).toEqual(['Natural', null]);
		expect(rows[1].key).toBe('p1|');
	});

	it('coerces string unit_price from Postgres to a number', () => {
		const rows = groupLinesByStyleColor(
			[line({ qty: 3, unit_price: '49.50' as unknown as number })],
			{
				p1: meta()
			}
		);
		expect(rows[0].unit_price).toBe(49.5);
		expect(rows[0].total).toBe(148.5);
	});

	it('handles missing product metadata by falling back to defaults', () => {
		const rows = groupLinesByStyleColor([line({})], {}); // no productsById entry for p1
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			image_id: null,
			season_label: null,
			available_colors: [],
			available_sizes: []
		});
	});
});
