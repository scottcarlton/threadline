import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { emailOrderToolInputSchema, parseEmailOrderOutput } from './email-order-extraction.js';

const order = {
	account_name: 'Bloom Boutique',
	brand_name: null,
	org_hint: null,
	ship_window: { start: '2027-02-10', end: '2027-02-28' },
	notes: null,
	items: [
		{
			raw_text: 'Linen Wrap Dress - Sand S:2 M:2 L:2',
			product_name: 'Linen Wrap Dress',
			color: 'Sand',
			sizes: [
				{ size: 'S', qty: 2 },
				{ size: 'M', qty: 2 },
				{ size: 'L', qty: 2 }
			]
		}
	]
};

describe('parseEmailOrderOutput', () => {
	it('accepts a well-formed order', () => {
		const result = parseEmailOrderOutput(order);

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.order.items[0].sizes).toHaveLength(3);
	});

	it('normalizes omitted and blank optional fields to null', () => {
		const result = parseEmailOrderOutput({
			account_name: 'Bloom Boutique',
			brand_name: '  ',
			items: [{ raw_text: 'x', product_name: 'Tee', sizes: [] }]
		});

		expect(result.ok && result.order).toMatchObject({
			brand_name: null,
			org_hint: null,
			ship_window: null,
			notes: null,
			items: [{ color: null }]
		});
	});

	it('fails the whole order on one bad line rather than dropping it', () => {
		const result = parseEmailOrderOutput({
			...order,
			items: [
				order.items[0],
				{ raw_text: 'Tee M:two', product_name: 'Tee', sizes: [{ size: 'M', qty: 'two' }] }
			]
		});

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues[0]).toMatch(/^items\.1\.sizes\.0\.qty/);
	});

	it('rejects fractional and negative quantities', () => {
		for (const qty of [1.5, -1]) {
			const result = parseEmailOrderOutput({
				...order,
				items: [{ ...order.items[0], sizes: [{ size: 'S', qty }] }]
			});
			expect(result.ok).toBe(false);
		}
	});

	it('rejects a missing account name', () => {
		expect(parseEmailOrderOutput({ ...order, account_name: '' }).ok).toBe(false);
	});

	it('rejects garbage without throwing', () => {
		for (const input of [null, 'order', 42, { items: 'none' }]) {
			expect(parseEmailOrderOutput(input).ok).toBe(false);
		}
	});

	it('accepts every cached real parser output in the eval fixtures', () => {
		const dir = join(import.meta.dirname, '../server/email-intake/__fixtures__');
		const files = readdirSync(dir).filter((f) => f.endsWith('.parsed.json'));
		expect(files.length).toBeGreaterThan(0);

		for (const file of files) {
			const result = parseEmailOrderOutput(JSON.parse(readFileSync(join(dir, file), 'utf-8')));
			expect(result, file).toMatchObject({ ok: true });
		}
	});
});

describe('emailOrderToolInputSchema', () => {
	it('keeps the required fields the hand-written schema had', () => {
		const schema = emailOrderToolInputSchema() as unknown as {
			required: string[];
			properties: { items: { items: { required: string[] } } };
		};

		expect(schema.required).toEqual(['account_name', 'items']);
		expect(schema.properties.items.items.required).toEqual(['raw_text', 'product_name', 'sizes']);
		expect(schema).not.toHaveProperty('$schema');
	});
});
