import { describe, it, expect } from 'vitest';
import { pickOwnBrand } from './ai-tools.js';

const brand = (id: string, name: string, is_self_brand = false) => ({ id, name, is_self_brand });

describe('pickOwnBrand', () => {
	it('prefers the self-brand when the org has several labels', () => {
		const rows = [brand('b1', 'Sub Label'), brand('b2', 'House Label', true)];
		expect(pickOwnBrand(rows)?.id).toBe('b2');
	});

	it('uses the only brand when there is exactly one, even without the self flag', () => {
		expect(pickOwnBrand([brand('b1', 'House Label')])?.id).toBe('b1');
	});

	it('returns null when several brands exist and none is the self-brand', () => {
		expect(pickOwnBrand([brand('b1', 'One'), brand('b2', 'Two')])).toBeNull();
	});

	it('returns null when the org has no visible brands', () => {
		expect(pickOwnBrand([])).toBeNull();
	});
});
