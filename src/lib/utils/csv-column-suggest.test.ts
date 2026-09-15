import { describe, it, expect } from 'vitest';
import { suggestColumnMapping, mapProductHeaders } from './csv-column-suggest.js';

describe('suggestColumnMapping', () => {
	it('matches the canonical field name exactly', () => {
		expect(suggestColumnMapping('name')).toBe('name');
		expect(suggestColumnMapping('style_number')).toBe('style_number');
		expect(suggestColumnMapping('wholesale_price')).toBe('wholesale_price');
		expect(suggestColumnMapping('retail_price')).toBe('retail_price');
		expect(suggestColumnMapping('category')).toBe('category');
	});

	it('normalizes case + punctuation + whitespace', () => {
		expect(suggestColumnMapping('Style Number')).toBe('style_number');
		expect(suggestColumnMapping('STYLE_NUMBER')).toBe('style_number');
		expect(suggestColumnMapping('style#')).toBe('style_number');
		expect(suggestColumnMapping('  Wholesale Price  ')).toBe('wholesale_price');
	});

	it('matches common brand-export synonyms for name', () => {
		expect(suggestColumnMapping('product_title')).toBe('name');
		expect(suggestColumnMapping('item_name')).toBe('name');
		expect(suggestColumnMapping('Title')).toBe('name');
	});

	it('matches common synonyms for style_number', () => {
		expect(suggestColumnMapping('SKU')).toBe('style_number');
		expect(suggestColumnMapping('item_number')).toBe('style_number');
		expect(suggestColumnMapping('Style No')).toBe('style_number');
	});

	it('matches common synonyms for wholesale_price', () => {
		expect(suggestColumnMapping('wholesale')).toBe('wholesale_price');
		expect(suggestColumnMapping('ws_price')).toBe('wholesale_price');
		expect(suggestColumnMapping('cost')).toBe('wholesale_price');
		expect(suggestColumnMapping('price_wholesale')).toBe('wholesale_price');
	});

	it('matches common synonyms for retail_price', () => {
		expect(suggestColumnMapping('retail')).toBe('retail_price');
		expect(suggestColumnMapping('MSRP')).toBe('retail_price');
		expect(suggestColumnMapping('SRP')).toBe('retail_price');
	});

	it('matches subcategory before category for ambiguous headers', () => {
		expect(suggestColumnMapping('subcategory')).toBe('subcategory');
		expect(suggestColumnMapping('sub_category')).toBe('subcategory');
		expect(suggestColumnMapping('subcat')).toBe('subcategory');
		// "category" alone resolves to category, not subcategory.
		expect(suggestColumnMapping('category')).toBe('category');
		expect(suggestColumnMapping('Department')).toBe('category');
	});

	it('matches sizes/colors synonyms (singular and plural)', () => {
		expect(suggestColumnMapping('size')).toBe('sizes');
		expect(suggestColumnMapping('Sizes')).toBe('sizes');
		expect(suggestColumnMapping('size_run')).toBe('sizes');
		expect(suggestColumnMapping('color')).toBe('colors');
		expect(suggestColumnMapping('Colors')).toBe('colors');
		expect(suggestColumnMapping('colorway')).toBe('colors');
		// British spellings.
		expect(suggestColumnMapping('colour')).toBe('colors');
		expect(suggestColumnMapping('colours')).toBe('colors');
	});

	it('matches season + product_year', () => {
		expect(suggestColumnMapping('Season')).toBe('season');
		expect(suggestColumnMapping('year')).toBe('product_year');
		expect(suggestColumnMapping('product_year')).toBe('product_year');
		expect(suggestColumnMapping('season_year')).toBe('product_year');
	});

	it('matches image_url variants', () => {
		expect(suggestColumnMapping('image')).toBe('image_url');
		expect(suggestColumnMapping('image_url')).toBe('image_url');
		expect(suggestColumnMapping('photo')).toBe('image_url');
		expect(suggestColumnMapping('photo_url')).toBe('image_url');
		expect(suggestColumnMapping('picture')).toBe('image_url');
		expect(suggestColumnMapping('img')).toBe('image_url');
		expect(suggestColumnMapping('image_link')).toBe('image_url');
	});

	it('returns null for unrecognized headers', () => {
		expect(suggestColumnMapping('notes_internal')).toBeNull();
		expect(suggestColumnMapping('vendor_id')).toBeNull();
		expect(suggestColumnMapping('arbitrary_column_xyz')).toBeNull();
		expect(suggestColumnMapping('')).toBeNull();
	});
});

describe('mapProductHeaders — wide exports', () => {
	// Trimmed from a real JOOR line sheet (92 columns). Each of these headers
	// used to steal a field from the correct column further right.
	const JOOR = [
		'Linesheet Name',
		'Collection Styles Comment',
		'Season Name',
		'Season Year ID',
		'Season Year',
		'Style Number',
		'Style Name',
		'Fabrication ID',
		'Silhouette',
		'Description',
		'Size ID',
		'Size Name',
		'Sizes Run',
		'Color Name',
		'Color Code',
		'Wholesale Currency_1',
		'Wholesale Price_1',
		'Retail Currency_1',
		'Suggested Retail Price_1',
		'Category1',
		'Style Image Filename_1',
		'Style Image URL_1'
	];

	const rowsFor = (over: Record<string, string> = {}) => [
		{
			'linesheet name': 'FW26',
			'collection styles comment': '',
			'season name': 'Fall/Winter',
			'season year id': '307824',
			'season year': '2026',
			'style number': '9108009648355',
			'style name': 'Sophie Blouse',
			'fabrication id': '',
			silhouette: 'Blouses',
			description: 'A blouse.',
			'size id': '114646513',
			'size name': 'M',
			'sizes run': '1',
			'color name': 'Black',
			'color code': '',
			'wholesale currency_1': 'USD',
			'wholesale price_1': '154.00',
			'retail currency_1': 'USD',
			'suggested retail price_1': '368.00',
			category1: 'Apparel',
			'style image filename_1': 'a.jpg',
			'style image url_1': 'https://cdn.example.com/a.jpg',
			...over
		},
		{ 'style number': '9108009648355', 'size name': 'L', 'sizes run': '1' } as Record<
			string,
			string
		>
	];

	it('assigns the right column for every field', () => {
		const m = mapProductHeaders(JOOR, rowsFor());
		expect(m.get('style_number')).toBe('style number');
		expect(m.get('name')).toBe('style name');
		expect(m.get('wholesale_price')).toBe('wholesale price_1');
		expect(m.get('retail_price')).toBe('suggested retail price_1');
		expect(m.get('sizes')).toBe('size name');
		expect(m.get('colors')).toBe('color name');
		expect(m.get('season')).toBe('season name');
		expect(m.get('product_year')).toBe('season year');
		expect(m.get('image_url')).toBe('style image url_1');
		expect(m.get('category')).toBe('category1');
	});

	it('does not let a currency column take a price field', () => {
		const m = mapProductHeaders(JOOR, rowsFor());
		expect(m.get('wholesale_price')).not.toBe('wholesale currency_1');
		expect(m.get('retail_price')).not.toBe('retail currency_1');
	});

	it('does not let an ID column take year', () => {
		expect(mapProductHeaders(JOOR, rowsFor()).get('product_year')).not.toBe('season year id');
	});

	it('never assigns one header to two fields', () => {
		const m = mapProductHeaders(JOOR, rowsFor());
		const used = [...m.values()];
		expect(new Set(used).size).toBe(used.length);
	});

	it('still maps a plain hand-made CSV', () => {
		const m = mapProductHeaders(
			['style_number', 'name', 'wholesale_price', 'sizes', 'colors', 'season', 'product_year'],
			[]
		);
		expect(m.get('style_number')).toBe('style_number');
		expect(m.get('name')).toBe('name');
		expect(m.get('wholesale_price')).toBe('wholesale_price');
		expect(m.get('sizes')).toBe('sizes');
		expect(m.get('product_year')).toBe('product_year');
	});

	it('falls back to header text alone when no rows are supplied', () => {
		const m = mapProductHeaders(['Style Number', 'Style Name', 'Wholesale Price'], []);
		expect(m.get('style_number')).toBe('style number');
		expect(m.get('name')).toBe('style name');
		expect(m.get('wholesale_price')).toBe('wholesale price');
	});
});

describe('mapProductHeaders — value checks must not overrule a clear header', () => {
	it('maps a constant sizes column when the header names the field outright', () => {
		// Our own CSV template ships "XS, S, M, L, XL" on every row, and a brand
		// with one size run across the catalogue is ordinary. The constant-column
		// check is a tie-breaker for ambiguous headers, not a veto.
		const m = mapProductHeaders(
			['style_number', 'name', 'wholesale_price', 'sizes', 'colors'],
			[
				{ sizes: 'XS, S, M, L, XL', colors: 'Black, White' },
				{ sizes: 'XS, S, M, L, XL', colors: 'Black, White' },
				{ sizes: 'XS, S, M, L, XL', colors: 'Black, White' }
			]
		);
		expect(m.get('sizes')).toBe('sizes');
		expect(m.get('colors')).toBe('colors');
	});

	it('still drops a constant column when the header is ambiguous', () => {
		const m = mapProductHeaders(
			['Style Number', 'Style Name', 'Wholesale Price', 'Sizes Run', 'Size Name'],
			[
				{ 'sizes run': '1', 'size name': 'M' },
				{ 'sizes run': '1', 'size name': 'L' }
			]
		);
		expect(m.get('sizes')).toBe('size name');
	});
});

describe('mapProductHeaders — weak matches are not assigned', () => {
	it('does not import a shipping cost column as the wholesale price', () => {
		const m = mapProductHeaders(
			['Style Number', 'Style Name', 'WSP', 'Shipping Cost'],
			[{ 'style number': 'A1', 'style name': 'Alpha', wsp: '10', 'shipping cost': '4.50' }]
		);
		expect(m.get('wholesale_price')).toBeUndefined();
	});

	it('keeps legitimate two-token headers that score at the floor', () => {
		const m = mapProductHeaders(
			['Style Number', 'Style Name', 'Wholesale Price', 'Size Name', 'Color Name'],
			[]
		);
		expect(m.get('sizes')).toBe('size name');
		expect(m.get('colors')).toBe('color name');
	});
});

describe('mapProductHeaders — header normalization', () => {
	it('does not let two fields claim the same column via case or whitespace', () => {
		const m = mapProductHeaders(
			['Style Number', 'Style Name', 'Wholesale Price', 'Size', 'size '],
			[]
		);
		const used = [...m.values()];
		expect(new Set(used).size).toBe(used.length);
	});
});
