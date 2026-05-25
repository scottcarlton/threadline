import { describe, it, expect } from 'vitest';
import {
	PRODUCT_ATTRIBUTES,
	getAttributeLabel,
	getAttributesByCategory
} from './product-attributes';

describe('product-attributes', () => {
	it('every attribute has a unique value', () => {
		const values = PRODUCT_ATTRIBUTES.map((a) => a.value);
		expect(new Set(values).size).toBe(values.length);
	});

	it('every attribute has a non-empty label and category', () => {
		for (const attr of PRODUCT_ATTRIBUTES) {
			expect(attr.label.length).toBeGreaterThan(0);
			expect(attr.category.length).toBeGreaterThan(0);
		}
	});

	it('getAttributeLabel returns label for known value', () => {
		expect(getAttributeLabel('recycled_materials')).toBe('Recycled Materials');
	});

	it('getAttributeLabel returns the raw value for unknown slug', () => {
		expect(getAttributeLabel('custom_thing')).toBe('custom_thing');
	});

	it('getAttributesByCategory groups correctly', () => {
		const grouped = getAttributesByCategory();
		expect(Object.keys(grouped).length).toBeGreaterThan(0);
		for (const [category, attrs] of Object.entries(grouped)) {
			expect(category.length).toBeGreaterThan(0);
			expect(attrs.length).toBeGreaterThan(0);
		}
	});
});
