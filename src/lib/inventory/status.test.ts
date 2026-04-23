import { describe, expect, it } from 'vitest';
import { deriveStockStatus } from './status';

describe('deriveStockStatus', () => {
	it('returns null when qty is null (untracked)', () => {
		expect(deriveStockStatus(null, null)).toBeNull();
		expect(deriveStockStatus(null, 5)).toBeNull();
	});

	it('returns "out" when qty is 0', () => {
		expect(deriveStockStatus(0, null)).toBe('out');
		expect(deriveStockStatus(0, 5)).toBe('out');
	});

	it('returns "low" when qty <= threshold', () => {
		expect(deriveStockStatus(5, 5)).toBe('low');
		expect(deriveStockStatus(3, 5)).toBe('low');
	});

	it('returns "in" when qty > threshold or threshold is null', () => {
		expect(deriveStockStatus(10, 5)).toBe('in');
		expect(deriveStockStatus(10, null)).toBe('in');
	});

	it('treats negative qty as "out" (defense-in-depth against bad data)', () => {
		expect(deriveStockStatus(-3, null)).toBe('out');
	});
});
