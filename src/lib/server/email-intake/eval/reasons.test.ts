import { describe, it, expect } from 'vitest';
import { classifyReason } from './reasons';

describe('classifyReason', () => {
	it('classifies account missing', () => {
		expect(classifyReason('Account could not be identified')).toBe('account_missing');
	});

	it('classifies account low confidence with numeric value', () => {
		expect(classifyReason('Account match confidence too low (0.432)')).toBe(
			'account_low_confidence'
		);
	});

	it('classifies brand missing', () => {
		expect(classifyReason('Brand could not be identified')).toBe('brand_missing');
	});

	it('classifies variant not found', () => {
		expect(classifyReason('No variant found for size "3XL"')).toBe('variant_not_found');
	});

	it('classifies qty out of range', () => {
		expect(classifyReason('Quantity 0 out of range [1, 999]')).toBe('qty_out_of_range');
		expect(classifyReason('Quantity 1000 out of range [1, 999]')).toBe('qty_out_of_range');
	});

	it('classifies resolve.ts issue codes via issueCode param', () => {
		expect(classifyReason('Best match "X" has confidence 0.5', 'low_confidence')).toBe(
			'product_low_confidence'
		);
		expect(classifyReason('"A" (0.7) vs "B" (0.68)', 'ambiguous_product')).toBe(
			'product_ambiguous'
		);
		expect(classifyReason('No product found matching "X"', 'no_match')).toBe('product_no_match');
		expect(classifyReason('No variant for size "S"', 'unknown_variant')).toBe('variant_unknown');
	});

	it('returns unknown for unrecognized reasons', () => {
		expect(classifyReason('Some new reason format')).toBe('unknown');
	});
});
