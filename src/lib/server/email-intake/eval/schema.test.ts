import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ExpectedSchema } from './schema';

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

const expectedFiles = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.expected.json'));

describe('ExpectedSchema validates all fixture labels', () => {
	for (const file of expectedFiles) {
		it(`validates ${file}`, () => {
			const raw = readFileSync(join(FIXTURES_DIR, file), 'utf-8');
			const parsed = JSON.parse(raw);
			const result = ExpectedSchema.safeParse(parsed);
			if (!result.success) {
				expect.fail(
					`${file} failed validation:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`
				);
			}
			expect(result.success).toBe(true);
		});
	}

	it('has at least 7 fixture labels', () => {
		expect(expectedFiles.length).toBeGreaterThanOrEqual(7);
	});
});

describe('seed consistency', () => {
	it('default seed has no dangling brand_id references', () => {
		const seed = JSON.parse(readFileSync(join(FIXTURES_DIR, 'seeds', 'default.json'), 'utf-8'));
		const brandIds = new Set(seed.brands.map((b: { id: string }) => b.id));
		for (const p of seed.products) {
			expect(brandIds.has(p.brand_id)).toBe(true);
		}
	});

	it('default seed has no dangling product_id references in variants', () => {
		const seed = JSON.parse(readFileSync(join(FIXTURES_DIR, 'seeds', 'default.json'), 'utf-8'));
		const productIds = new Set(seed.products.map((p: { id: string }) => p.id));
		for (const v of seed.product_variants) {
			expect(productIds.has(v.product_id)).toBe(true);
		}
	});

	it('default seed has no dangling organization_id references', () => {
		const seed = JSON.parse(readFileSync(join(FIXTURES_DIR, 'seeds', 'default.json'), 'utf-8'));
		const orgIds = new Set(seed.organizations.map((o: { id: string }) => o.id));
		for (const a of seed.accounts) {
			expect(orgIds.has(a.organization_id)).toBe(true);
		}
		for (const b of seed.brands) {
			expect(orgIds.has(b.organization_id)).toBe(true);
		}
	});

	it('every .expected.json account/brand/product name exists in default seed', () => {
		const seed = JSON.parse(readFileSync(join(FIXTURES_DIR, 'seeds', 'default.json'), 'utf-8'));
		const accountNames = new Set(
			seed.accounts.map((a: { business_name: string }) => a.business_name)
		);
		const brandNames = new Set(seed.brands.map((b: { name: string }) => b.name));
		const productNames = new Set(seed.products.map((p: { name: string }) => p.name));

		for (const file of expectedFiles) {
			const expected = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));

			if (expected.resolver?.expected_account_name) {
				expect(
					accountNames.has(expected.resolver.expected_account_name),
					`${file}: account "${expected.resolver.expected_account_name}" not in seed`
				).toBe(true);
			}
			if (expected.resolver?.expected_brand_name) {
				expect(
					brandNames.has(expected.resolver.expected_brand_name),
					`${file}: brand "${expected.resolver.expected_brand_name}" not in seed`
				).toBe(true);
			}
			for (const line of expected.resolver?.lines ?? []) {
				if (line.expected_product_name) {
					expect(
						productNames.has(line.expected_product_name),
						`${file}: product "${line.expected_product_name}" not in seed`
					).toBe(true);
				}
			}
		}
	});
});

describe('reason taxonomy', () => {
	it('every expected_reason_code is a known code', () => {
		const knownCodes = new Set([
			'account_missing',
			'account_low_confidence',
			'brand_missing',
			'variant_not_found',
			'qty_out_of_range',
			'product_low_confidence',
			'product_ambiguous',
			'product_no_match',
			'variant_unknown'
		]);

		for (const file of expectedFiles) {
			const expected = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));
			for (const code of expected.outcome?.expected_reason_codes ?? []) {
				expect(knownCodes.has(code), `${file}: unknown reason code "${code}"`).toBe(true);
			}
		}
	});
});
