import { describe, it, expect } from 'vitest';
import { linesheetToolInputSchema, parseLinesheetOutput } from './linesheet-extraction.js';

const good = {
	style_number: 'LW-101',
	name: 'Linen Wrap Dress',
	wholesale_price: 68,
	retail_price: 165,
	category: 'Dresses',
	sizes: ['S', 'M', 'L'],
	colors: ['Sand']
};

describe('parseLinesheetOutput', () => {
	it('keeps every row of a clean sheet', () => {
		const result = parseLinesheetOutput({ season: 'Resort', year: 2027, products: [good] });

		expect(result.products).toHaveLength(1);
		expect(result.products[0].wholesale_price).toBe(68);
		expect(result.unreadable).toEqual([]);
		expect(result.season).toBe('Resort');
		expect(result.year).toBe(2027);
	});

	it('leaves out a row with no price instead of pricing it at $0', () => {
		const result = parseLinesheetOutput({
			products: [good, { style_number: 'LW-102', name: 'Linen Pant' }]
		});

		expect(result.products.map((p) => p.style_number)).toEqual(['LW-101']);
		expect(result.unreadable).toHaveLength(1);
		expect(result.unreadable[0]).toMatchObject({ index: 1, style_number: 'LW-102' });
		expect(result.unreadable[0].issues[0]).toMatch(/^wholesale_price/);
	});

	it('rejects a price the model returned as text', () => {
		const result = parseLinesheetOutput({ products: [{ ...good, wholesale_price: '$68' }] });

		expect(result.products).toEqual([]);
		expect(result.unreadable).toHaveLength(1);
	});

	it('rejects blank style numbers and names', () => {
		const result = parseLinesheetOutput({
			products: [
				{ ...good, style_number: '   ' },
				{ ...good, name: '' }
			]
		});

		expect(result.products).toEqual([]);
		expect(result.unreadable.map((r) => r.index)).toEqual([0, 1]);
	});

	it('drops a garbled optional field but keeps the style', () => {
		const result = parseLinesheetOutput({
			products: [{ ...good, retail_price: 'TBD', product_year: 25, sizes: 'S/M/L' }]
		});

		expect(result.products).toHaveLength(1);
		expect(result.products[0].retail_price).toBeUndefined();
		expect(result.products[0].product_year).toBeUndefined();
		expect(result.products[0].sizes).toBeUndefined();
	});

	it('returns nothing usable for garbage input without throwing', () => {
		for (const input of [null, 'products', 42, { products: 'none' }]) {
			const result = parseLinesheetOutput(input);
			expect(result.products).toEqual([]);
			expect(result.unreadable).toEqual([]);
		}
	});

	it('treats a blank season as no season', () => {
		expect(parseLinesheetOutput({ season: '  ', products: [good] }).season).toBeNull();
	});
});

describe('linesheetToolInputSchema', () => {
	it('requires the fields the parser requires', () => {
		const schema = linesheetToolInputSchema() as unknown as {
			required: string[];
			properties: { products: { items: { required: string[] } } };
		};

		expect(schema.required).toEqual(['products']);
		expect(schema.properties.products.items.required).toEqual([
			'style_number',
			'name',
			'wholesale_price'
		]);
		expect(schema).not.toHaveProperty('$schema');
	});
});
