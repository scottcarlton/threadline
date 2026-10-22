import { describe, expect, it } from 'vitest';
import { detectDrift, driftReason } from './drift';

const products = new Map([
	['p1', { wholesale_price: '20.00' }],
	['p2', { wholesale_price: 35 }]
]);

describe('detectDrift', () => {
	it('is null when captured prices and terms still hold', () => {
		expect(
			detectDrift(
				[
					{ product_id: 'p1', unit_price: 20 },
					{ product_id: 'p2', unit_price: 35.001 }
				],
				products,
				[]
			)
		).toBeNull();
	});

	it('counts lines whose captured price no longer matches', () => {
		expect(
			detectDrift(
				[
					{ product_id: 'p1', unit_price: 18 },
					{ product_id: 'p2', unit_price: 35 },
					{ product_id: 'p1', unit_price: 19 }
				],
				products,
				[]
			)
		).toEqual({ priceLines: 2, termsBrands: 0 });
	});

	it('ignores lines with no captured price', () => {
		expect(detectDrift([{ product_id: 'p1' }], products, [])).toBeNull();
	});

	it('counts each brand with replaced terms once', () => {
		expect(detectDrift([], products, ['b1', 'b1', 'b2'])).toEqual({
			priceLines: 0,
			termsBrands: 2
		});
	});
});

describe('driftReason', () => {
	it('explains price drift', () => {
		expect(driftReason({ priceLines: 1, termsBrands: 0 })).toBe(
			'Saved as a draft: prices changed on 1 line since it was written.'
		);
	});

	it('explains terms drift, singular and plural', () => {
		expect(driftReason({ priceLines: 0, termsBrands: 1 })).toBe(
			'Saved as a draft: a brand updated its terms.'
		);
		expect(driftReason({ priceLines: 0, termsBrands: 3 })).toBe(
			'Saved as a draft: 3 brands updated their terms.'
		);
	});

	it('joins both', () => {
		expect(driftReason({ priceLines: 2, termsBrands: 1 })).toBe(
			'Saved as a draft: prices changed on 2 lines since it was written, and a brand updated its terms.'
		);
	});
});
