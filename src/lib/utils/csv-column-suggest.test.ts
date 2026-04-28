import { describe, it, expect } from 'vitest';
import { suggestColumnMapping } from './csv-column-suggest.js';

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
