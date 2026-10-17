import { describe, it, expect } from 'vitest';
import { unreadableCount, unreadableStylesNotice } from './linesheet-unreadable.js';

describe('unreadableStylesNotice', () => {
	it('says nothing when every style was read', () => {
		for (const value of [0, undefined, null, '3', -1, 1.5]) {
			expect(unreadableStylesNotice(value)).toBeNull();
		}
	});

	it('names the count, singular and plural', () => {
		expect(unreadableStylesNotice(1)).toBe(
			"1 style left out. We couldn't read its price, style number, or name. Add it by hand or check the line sheet."
		);
		expect(unreadableStylesNotice(3)).toBe(
			"3 styles left out. We couldn't read their price, style number, or name. Add them by hand or check the line sheet."
		);
	});
});

describe('unreadableCount', () => {
	it('only trusts positive integers from the response', () => {
		expect(unreadableCount(4)).toBe(4);
		expect(unreadableCount('4')).toBe(0);
	});
});
