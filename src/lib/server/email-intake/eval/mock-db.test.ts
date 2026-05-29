import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MockSupabase, type DbSeed } from './mock-db';
import { trigramSimilarity } from './trigram';
import { THRESHOLDS } from '../resolve';

const SEED_PATH = join(__dirname, '..', '__fixtures__', 'seeds', 'default.json');
let seed: DbSeed;
let mock: MockSupabase;

beforeAll(() => {
	seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
	mock = new MockSupabase(seed);
});

// ═══════════════════════════════════════════════════════════════════════════
// Trigram similarity contract
// ═══════════════════════════════════════════════════════════════════════════

describe('trigramSimilarity', () => {
	it('identical strings score 1.0', () => {
		expect(trigramSimilarity('Bloom Boutique', 'Bloom Boutique')).toBe(1.0);
	});

	it('empty strings score 0', () => {
		expect(trigramSimilarity('', 'something')).toBe(0);
		expect(trigramSimilarity('something', '')).toBe(0);
	});

	it('near-misses score above ACCOUNT_MIN', () => {
		const score = trigramSimilarity('Bloom Boutique', 'bloom boutique');
		expect(score).toBeGreaterThanOrEqual(THRESHOLDS.ACCOUNT_MIN);
	});

	it('partial match "Bloom" vs "Bloom Boutique" scores meaningfully but lower', () => {
		const score = trigramSimilarity('Bloom', 'Bloom Boutique');
		expect(score).toBeGreaterThan(0.2);
		expect(score).toBeLessThan(1.0);
	});

	it('"Bloom" vs "Bloom Boutique" and "Bloom Brothers" are close (ambiguity)', () => {
		const s1 = trigramSimilarity('Bloom', 'Bloom Boutique');
		const s2 = trigramSimilarity('Bloom', 'Bloom Brothers');
		const delta = Math.abs(s1 - s2);
		expect(delta).toBeLessThan(THRESHOLDS.ACCOUNT_AMBIGUITY_DELTA);
	});

	it('clear non-matches score below ACCOUNT_MIN', () => {
		const score = trigramSimilarity('Totally Different Name', 'Bloom Boutique');
		expect(score).toBeLessThan(THRESHOLDS.ACCOUNT_MIN);
	});

	it('product exact match scores 1.0', () => {
		expect(
			trigramSimilarity('Kailua Bubble Gauze Cotton Shirt', 'Kailua Bubble Gauze Cotton Shirt')
		).toBe(1.0);
	});

	it('product near-miss scores above PRODUCT_MIN', () => {
		const score = trigramSimilarity(
			'Kailua Bubble Gauze Cotton Shirt',
			'kailua bubble gauze cotton shirt'
		);
		expect(score).toBeGreaterThanOrEqual(THRESHOLDS.PRODUCT_MIN);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Query builder methods
// ═══════════════════════════════════════════════════════════════════════════

describe('MockSupabase query builder', () => {
	it('from().select().eq() filters rows', async () => {
		const { data } = await mock
			.from('accounts')
			.select('id, business_name')
			.eq('organization_id', 'org-mh');
		expect(data).not.toBeNull();
		expect(data!.length).toBe(3);
		expect(data!.every((r) => 'id' in r && 'business_name' in r)).toBe(true);
	});

	it('from().select().in() filters by set', async () => {
		const { data } = await mock
			.from('organizations')
			.select('id, name')
			.in('id', ['org-mh', 'org-ic']);
		expect(data).not.toBeNull();
		expect(data!.length).toBe(2);
	});

	it('from().select().ilike() does case-insensitive substring match', async () => {
		const { data } = await mock
			.from('accounts')
			.select('id, business_name')
			.ilike('business_name', '%bloom%');
		expect(data).not.toBeNull();
		expect(data!.length).toBe(2);
	});

	it('from().select().eq().order().limit() chains correctly', async () => {
		const { data } = await mock
			.from('accounts')
			.select('id, business_name')
			.eq('organization_id', 'org-mh')
			.order('business_name')
			.limit(2);
		expect(data).not.toBeNull();
		expect(data!.length).toBe(2);
		expect((data![0] as { business_name: string }).business_name).toBe('Bloom Boutique');
	});

	it('product_variants resolves wholesale_price from unit_price', async () => {
		const { data } = await mock
			.from('product_variants')
			.select('id, wholesale_price')
			.eq('product_id', 'prod-kailua')
			.ilike('size', 'S')
			.limit(1);
		expect(data).not.toBeNull();
		expect(data!.length).toBe(1);
		expect((data![0] as { wholesale_price: number }).wholesale_price).toBe(68);
	});

	it('product_variants with color filter', async () => {
		const { data } = await mock
			.from('product_variants')
			.select('id, wholesale_price')
			.eq('product_id', 'prod-catya')
			.ilike('size', 'S')
			.ilike('color', 'Monarch Haze')
			.limit(1);
		expect(data).not.toBeNull();
		expect(data!.length).toBe(1);
	});

	it('product_variants with non-existent size returns empty', async () => {
		const { data } = await mock
			.from('product_variants')
			.select('id, wholesale_price')
			.eq('product_id', 'prod-kailua')
			.ilike('size', '3XL')
			.limit(1);
		expect(data).not.toBeNull();
		expect(data!.length).toBe(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// RPC — trigram matching
// ═══════════════════════════════════════════════════════════════════════════

describe('MockSupabase RPC', () => {
	it('trigram_match_accounts returns sorted by similarity', () => {
		const result = mock.rpc('trigram_match_accounts', {
			p_org_id: 'org-mh',
			p_search: 'Bloom Boutique',
			p_limit: 2
		});
		const { data } = result as {
			data: Array<{ id: string; similarity: number }> | null;
			error: null;
		};
		expect(data).not.toBeNull();
		expect(data!.length).toBe(2);
		expect(data![0].similarity).toBeGreaterThanOrEqual(data![1].similarity);
		expect(data![0].id).toBe('acct-bloom');
	});

	it('trigram_match_accounts: "Bloom" is ambiguous between Bloom Boutique and Bloom Brothers', () => {
		const result = mock.rpc('trigram_match_accounts', {
			p_org_id: 'org-mh',
			p_search: 'Bloom',
			p_limit: 2
		});
		const { data } = result as {
			data: Array<{ id: string; business_name: string; similarity: number }> | null;
			error: null;
		};
		expect(data).not.toBeNull();
		expect(data!.length).toBe(2);
		const delta = Math.abs(data![0].similarity - data![1].similarity);
		expect(delta).toBeLessThan(THRESHOLDS.ACCOUNT_AMBIGUITY_DELTA);
	});

	it('trigram_match_brands returns best match', () => {
		const result = mock.rpc('trigram_match_brands', {
			p_org_id: 'org-mh',
			p_search: 'Monarch Haze',
			p_limit: 1
		});
		const { data } = result as {
			data: Array<{ id: string; name: string; similarity: number }> | null;
			error: null;
		};
		expect(data).not.toBeNull();
		expect(data!.length).toBe(1);
		expect(data![0].similarity).toBe(1.0);
		expect(data![0].id).toBe('brand-mh');
	});

	it('trigram_match_products with brand filter', () => {
		const result = mock.rpc('trigram_match_products', {
			p_org_id: 'org-mh',
			p_search: 'Kailua Bubble Gauze Cotton Shirt',
			p_limit: 2,
			p_brand_id: 'brand-mh'
		});
		const { data } = result as {
			data: Array<{ id: string; name: string; similarity: number }> | null;
			error: null;
		};
		expect(data).not.toBeNull();
		expect(data![0].similarity).toBe(1.0);
		expect(data![0].id).toBe('prod-kailua');
	});

	it('trigram_match_products without brand filter returns all org products', () => {
		const result = mock.rpc('trigram_match_products', {
			p_org_id: 'org-mh',
			p_search: 'Silk Wrap',
			p_limit: 4
		});
		const { data } = result as {
			data: Array<{ id: string; name: string; similarity: number }> | null;
			error: null;
		};
		expect(data).not.toBeNull();
		expect(data![0].id).toBe('prod-silk-wrap');
	});

	it('unknown RPC returns empty', () => {
		const result = mock.rpc('unknown_function', {});
		const { data } = result as { data: unknown[] | null; error: null };
		expect(data).toEqual([]);
	});
});
