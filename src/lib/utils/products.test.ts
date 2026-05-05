import { describe, it, expect } from 'vitest';
import { getVariantSummary, aggregateStockStatus } from './products';

describe('getVariantSummary', () => {
	it('returns color and size counts', () => {
		const variants = [
			{ color: 'Red', size: 'S' },
			{ color: 'Red', size: 'M' },
			{ color: 'Blue', size: 'S' }
		];
		expect(getVariantSummary(variants)).toBe('2 colors, 2 sizes');
	});

	it('returns singular when one of each', () => {
		expect(getVariantSummary([{ color: 'Red', size: 'M' }])).toBe('1 color, 1 size');
	});

	it('returns only colors when no sizes', () => {
		const variants = [
			{ color: 'Red', size: null },
			{ color: 'Blue', size: null }
		];
		expect(getVariantSummary(variants)).toBe('2 colors');
	});

	it('returns only sizes when no colors', () => {
		const variants = [
			{ color: null, size: 'S' },
			{ color: null, size: 'M' }
		];
		expect(getVariantSummary(variants)).toBe('2 sizes');
	});

	it('returns "No variants" for empty array', () => {
		expect(getVariantSummary([])).toBe('No variants');
	});
});

describe('aggregateStockStatus', () => {
	it('returns null for empty variants', () => {
		expect(aggregateStockStatus([])).toBeNull();
	});

	it('returns null when all stock data is null', () => {
		expect(aggregateStockStatus([{ stock_qty: null, stock_threshold: null }])).toBeNull();
	});

	it('returns "in" when all variants are in stock', () => {
		const variants = [
			{ stock_qty: 50, stock_threshold: 10 },
			{ stock_qty: 30, stock_threshold: 5 }
		];
		expect(aggregateStockStatus(variants)).toBe('in');
	});

	it('returns "low" when any variant is low', () => {
		const variants = [
			{ stock_qty: 50, stock_threshold: 10 },
			{ stock_qty: 3, stock_threshold: 5 }
		];
		expect(aggregateStockStatus(variants)).toBe('low');
	});

	it('returns "out" when any variant is out', () => {
		const variants = [
			{ stock_qty: 50, stock_threshold: 10 },
			{ stock_qty: 0, stock_threshold: 5 }
		];
		expect(aggregateStockStatus(variants)).toBe('out');
	});
});
