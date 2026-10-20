import { describe, it, expect } from 'vitest';
import { overStockLines } from './over-stock';

const product = (
	ats: boolean,
	variants: { color: string | null; size: string | null; stock_qty: number | null }[]
) => ({
	id: 'p1',
	ats,
	product_variants: variants
});
const line = (qty: number, color: string | null = 'Black', size: string | null = 'M') => ({
	product_id: 'p1',
	color,
	size,
	qty
});

describe('overStockLines', () => {
	const variants = [
		{ color: 'Black', size: 'M', stock_qty: 5 },
		{ color: 'Black', size: 'L', stock_qty: null }
	];

	it('flags a line over the matched variant stock', () => {
		expect(overStockLines([line(6)], [product(true, variants)])).toHaveLength(1);
	});

	it('allows a line equal to stock', () => {
		expect(overStockLines([line(5)], [product(true, variants)])).toHaveLength(0);
	});

	it('skips prebook (non-ATS) products', () => {
		expect(overStockLines([line(99)], [product(false, variants)])).toHaveLength(0);
	});

	it('skips untracked stock and unmatched variants', () => {
		expect(overStockLines([line(99, 'Black', 'L')], [product(true, variants)])).toHaveLength(0);
		expect(overStockLines([line(99, 'Red', 'M')], [product(true, variants)])).toHaveLength(0);
	});

	it('matches sizeless and colorless variants', () => {
		const p = product(true, [{ color: null, size: null, stock_qty: 2 }]);
		expect(overStockLines([line(3, null, null)], [p])).toHaveLength(1);
	});

	it('skips lines with no product', () => {
		expect(
			overStockLines([{ ...line(99), product_id: null }], [product(true, variants)])
		).toHaveLength(0);
	});
});
