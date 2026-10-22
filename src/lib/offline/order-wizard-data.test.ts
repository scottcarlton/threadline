import { describe, expect, it } from 'vitest';
import type { CatalogProduct } from '$lib/components/shared/catalog-picker-types';
import {
	filterCatalog,
	localReference,
	mergeById,
	queuedAccounts,
	searchAccounts
} from './order-wizard-data';
import { item } from './test-helpers';

const product = (over: Partial<CatalogProduct>): CatalogProduct => ({
	id: 'p',
	brand_id: 'b1',
	season_id: 's1',
	product_year: 2026,
	style_number: 'ST-1',
	name: 'Tee',
	wholesale_price: 20,
	category: 'Tops',
	ats: false,
	product_variants: [],
	product_images: [],
	...over
});

describe('filterCatalog', () => {
	const catalog = [
		product({ id: 'c', style_number: 'ST-3', name: 'Linen Shirt', wholesale_price: 80 }),
		product({ id: 'a', style_number: 'ST-1', name: 'Tee', ats: true }),
		product({ id: 'b', style_number: 'ST-2', name: 'Dress', brand_id: 'b2', category: 'Dresses' }),
		product({ id: 'd', style_number: 'ST-4', name: 'Cap', season_id: null })
	];

	it('orders by style number like the API', () => {
		expect(filterCatalog(catalog, {}).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
	});

	it('matches text against style number, name and category, ignoring case', () => {
		expect(filterCatalog(catalog, { q: 'linen' }).map((p) => p.id)).toEqual(['c']);
		expect(filterCatalog(catalog, { q: 'st-2' }).map((p) => p.id)).toEqual(['b']);
		expect(filterCatalog(catalog, { q: 'DRESSES' }).map((p) => p.id)).toEqual(['b']);
	});

	it('filters by brand, season, price and ATS', () => {
		expect(filterCatalog(catalog, { brandIds: ['b2'] }).map((p) => p.id)).toEqual(['b']);
		expect(filterCatalog(catalog, { seasonIds: ['s1'] }).map((p) => p.id)).toEqual(['a', 'b', 'c']);
		expect(filterCatalog(catalog, { minPrice: 50 }).map((p) => p.id)).toEqual(['c']);
		expect(filterCatalog(catalog, { maxPrice: 50 }).map((p) => p.id)).toEqual(['a', 'b', 'd']);
		expect(filterCatalog(catalog, { atsOnly: true }).map((p) => p.id)).toEqual(['a']);
	});

	it('caps the result', () => {
		expect(filterCatalog(catalog, { limit: 2 })).toHaveLength(2);
	});
});

describe('searchAccounts', () => {
	const accounts = [
		{ business_name: 'Bloom' },
		{ business_name: 'Allison' },
		{ business_name: 'Bloomsbury' }
	];
	it('matches the name, A to Z, empty query returns all', () => {
		expect(searchAccounts(accounts, 'bloom').map((a) => a.business_name)).toEqual([
			'Bloom',
			'Bloomsbury'
		]);
		expect(searchAccounts(accounts, '').map((a) => a.business_name)).toEqual([
			'Allison',
			'Bloom',
			'Bloomsbury'
		]);
		expect(searchAccounts(accounts, '', 1)).toHaveLength(1);
	});
});

describe('queuedAccounts', () => {
	const payload = (id: string, orgId = 'org-1') => ({
		organization_id: orgId,
		account: {
			id,
			primaryLocationId: `${id}-primary`,
			business: {
				name: `Store ${id}`,
				address: { city: 'Austin' },
				additionalLocations: [{ id: `${id}-annex`, label: 'Annex', address: {}, contact: {} }]
			},
			contact: { firstName: 'Ada', lastName: 'Lovelace', email: '' }
		}
	});

	it('turns queued accounts into wizard accounts and locations with their client ids', () => {
		const out = queuedAccounts([item({ id: 'a1', payload: payload('a1') })], 'org-1');
		expect(out.accounts).toMatchObject([{ id: 'a1', business_name: 'Store a1', city: 'Austin' }]);
		expect(out.locations.map((l) => [l.id, l.account_id, l.is_default])).toEqual([
			['a1-primary', 'a1', true],
			['a1-annex', 'a1', false]
		]);
		expect(out.pendingIds.has('a1')).toBe(true);
	});

	it('skips failed accounts, other orgs and other kinds', () => {
		const out = queuedAccounts(
			[
				item({ id: 'f', status: 'failed', payload: payload('f') }),
				item({ id: 'o', payload: payload('o', 'org-2') }),
				item({ id: 'x', kind: 'order.create', payload: {} })
			],
			'org-1'
		);
		expect(out.accounts).toEqual([]);
	});

	it('keeps a synced account selectable but no longer something to wait on', () => {
		const out = queuedAccounts(
			[item({ id: 's', status: 'synced', payload: payload('s') })],
			'org-1'
		);
		expect(out.accounts).toHaveLength(1);
		expect(out.pendingIds.size).toBe(0);
	});
});

describe('mergeById and localReference', () => {
	it('prefers snapshot rows and adds only missing ones', () => {
		expect(
			mergeById(
				[{ id: '1', v: 'snap' }],
				[
					{ id: '1', v: 'queued' },
					{ id: '2', v: 'queued' }
				]
			)
		).toEqual([
			{ id: '1', v: 'snap' },
			{ id: '2', v: 'queued' }
		]);
	});

	it('builds a short readable reference', () => {
		expect(localReference('7d9f3c1e-2b4a-4f6d-8e0c-1a2b3c4d5e6f')).toBe('7D9F3C');
	});
});
