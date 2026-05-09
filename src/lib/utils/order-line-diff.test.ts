import { describe, expect, it } from 'vitest';
import { diffLineEdits, type DraftRowInput } from './order-line-diff.js';

function row(overrides: Partial<DraftRowInput>): DraftRowInput {
	return {
		product_id: 'p1',
		color: 'Natural',
		color_edit: 'Natural',
		style_number: 'M-1',
		name: 'Shirt',
		unit_price: 100,
		qty_by_size: {},
		available_sizes: ['XS', 'S', 'M', 'L'],
		lines: [],
		to_remove: false,
		...overrides
	};
}

describe('diffLineEdits', () => {
	it('inserts a brand-new row qty', () => {
		const ops = diffLineEdits([row({ qty_by_size: { S: 2 } })]);
		expect(ops).toEqual([
			{
				kind: 'insert',
				row: {
					product_id: 'p1',
					style_number: 'M-1',
					description: 'Shirt',
					color: 'Natural',
					size: 'S',
					qty: 2,
					unit_price: 100
				}
			}
		]);
	});

	it('updates qty on an existing line', () => {
		const ops = diffLineEdits([
			row({
				qty_by_size: { S: 5 },
				lines: [{ id: 'l1', product_id: 'p1', color: 'Natural', size: 'S', qty: 2 }]
			})
		]);
		expect(ops).toEqual([{ kind: 'update', id: 'l1', patch: { qty: 5 } }]);
	});

	it('soft-removes when qty goes to 0', () => {
		const ops = diffLineEdits([
			row({
				qty_by_size: { S: 0 },
				lines: [{ id: 'l1', product_id: 'p1', color: 'Natural', size: 'S', qty: 3 }]
			})
		]);
		expect(ops).toEqual([{ kind: 'soft_remove', id: 'l1' }]);
	});

	it('no-op when qty is unchanged', () => {
		const ops = diffLineEdits([
			row({
				qty_by_size: { S: 2 },
				lines: [{ id: 'l1', product_id: 'p1', color: 'Natural', size: 'S', qty: 2 }]
			})
		]);
		expect(ops).toEqual([]);
	});

	it('soft-removes every line when row is marked to_remove', () => {
		const ops = diffLineEdits([
			row({
				to_remove: true,
				qty_by_size: { S: 5, M: 10 },
				lines: [
					{ id: 'l1', product_id: 'p1', color: 'Natural', size: 'S', qty: 5 },
					{ id: 'l2', product_id: 'p1', color: 'Natural', size: 'M', qty: 10 }
				]
			})
		]);
		expect(ops).toEqual([
			{ kind: 'soft_remove', id: 'l1' },
			{ kind: 'soft_remove', id: 'l2' }
		]);
	});

	it('applies color change to every surviving line', () => {
		const ops = diffLineEdits([
			row({
				color_edit: 'Black',
				qty_by_size: { S: 2, M: 0 },
				lines: [
					{ id: 'l1', product_id: 'p1', color: 'Natural', size: 'S', qty: 2 },
					{ id: 'l2', product_id: 'p1', color: 'Natural', size: 'M', qty: 1 }
				]
			})
		]);
		expect(ops).toContainEqual({
			kind: 'update',
			id: 'l1',
			patch: { color: 'Black' }
		});
		expect(ops).toContainEqual({ kind: 'soft_remove', id: 'l2' });
	});

	it('reconciles a legacy size missing from available_sizes', () => {
		const ops = diffLineEdits([
			row({
				available_sizes: ['S', 'M'],
				qty_by_size: { S: 2 },
				lines: [
					{ id: 'l1', product_id: 'p1', color: 'Natural', size: 'S', qty: 2 },
					{ id: 'l2', product_id: 'p1', color: 'Natural', size: 'XXL', qty: 1 }
				]
			})
		]);
		// XXL is legacy — default qty_by_size['XXL'] is 0 → soft_remove
		expect(ops).toContainEqual({ kind: 'soft_remove', id: 'l2' });
		expect(ops.filter((o) => o.kind === 'update').length).toBe(0);
	});

	it('inserts new color as insert, not update, when draft row has no lines', () => {
		// "+ Add color" flow: same product, new color → fresh DraftRow with
		// color === color_edit and empty lines.
		const ops = diffLineEdits([
			row({
				color: 'Black',
				color_edit: 'Black',
				qty_by_size: { M: 3 },
				lines: []
			})
		]);
		expect(ops).toEqual([
			{
				kind: 'insert',
				row: {
					product_id: 'p1',
					style_number: 'M-1',
					description: 'Shirt',
					color: 'Black',
					size: 'M',
					qty: 3,
					unit_price: 100
				}
			}
		]);
	});

	it('null size (unsized product) round-trips', () => {
		const ops = diffLineEdits([
			row({
				available_sizes: [],
				qty_by_size: { '': 4 },
				lines: [{ id: 'l1', product_id: 'p1', color: 'Natural', size: null, qty: 2 }]
			})
		]);
		expect(ops).toEqual([{ kind: 'update', id: 'l1', patch: { qty: 4 } }]);
	});
});
