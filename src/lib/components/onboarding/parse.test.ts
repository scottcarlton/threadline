import { describe, it, expect } from 'vitest';
import {
	pickHeader,
	normalizeRole,
	toNumber,
	parseMembers,
	parseProducts,
	parseOrders,
	capRows,
	importedCount,
	MAX_IMPORT_ROWS
} from './parse';

// parseCSV lowercases headers into the row keys, so fixtures mirror that shape.
const rowsOf = (...rows: Record<string, string>[]) => rows;

describe('pickHeader', () => {
	it('matches case- and whitespace-insensitively', () => {
		expect(pickHeader([' Email ', 'Role'], ['email'])).toBe('email');
	});

	it('honours candidate order, not header order', () => {
		expect(pickHeader(['email_address', 'email'], ['email', 'email_address'])).toBe('email');
	});

	it('returns null when nothing matches', () => {
		expect(pickHeader(['name'], ['email'])).toBeNull();
	});
});

describe('normalizeRole', () => {
	it('maps common spellings onto the four roles', () => {
		expect(normalizeRole('Admin')).toBe('admin');
		expect(normalizeRole('  SALES REP ')).toBe('sales');
		expect(normalizeRole('guest user')).toBe('guest');
		expect(normalizeRole('')).toBe('member');
		expect(normalizeRole('anything else')).toBe('member');
	});
});

describe('toNumber', () => {
	it('strips currency formatting', () => {
		expect(toNumber('$1,250')).toBe(1250);
		expect(toNumber(' 42 ')).toBe(42);
	});

	it('returns null for non-numeric text', () => {
		expect(toNumber('abc')).toBeNull();
	});

	it('treats blank as missing, not zero', () => {
		// Number('') === 0; a blank price column must not import as $0.00.
		expect(toNumber('')).toBeNull();
		expect(toNumber('   ')).toBeNull();
	});
});

describe('parseMembers', () => {
	const headers = ['email', 'first name', 'last name', 'role', 'commission'];

	it('returns nothing without an email column', () => {
		expect(parseMembers(['name'], rowsOf({ name: 'Jane' }))).toEqual([]);
	});

	it('skips rows with a missing or malformed email', () => {
		const out = parseMembers(
			headers,
			rowsOf({ email: '' }, { email: 'not-an-email' }, { email: 'jane@acme.com' })
		);
		expect(out).toHaveLength(1);
		expect(out[0].email).toBe('jane@acme.com');
	});

	it('joins first and last name, defaulting the role to member', () => {
		const [m] = parseMembers(
			headers,
			rowsOf({ email: 'jane@acme.com', 'first name': 'Jane', 'last name': 'Doe' })
		);
		expect(m.name).toBe('Jane Doe');
		expect(m.role).toBe('member');
	});

	it('keeps commission only for sales', () => {
		const out = parseMembers(
			headers,
			rowsOf(
				{ email: 'a@acme.com', role: 'sales', commission: '10%' },
				{ email: 'b@acme.com', role: 'admin', commission: '10' }
			)
		);
		expect(out[0].commissionRate).toBe(10);
		expect(out[1].commissionRate).toBeNull();
	});

	it('ignores a zero or unparseable commission', () => {
		const out = parseMembers(
			headers,
			rowsOf(
				{ email: 'a@acme.com', role: 'sales', commission: '0' },
				{ email: 'b@acme.com', role: 'sales', commission: 'n/a' }
			)
		);
		expect(out[0].commissionRate).toBeNull();
		expect(out[1].commissionRate).toBeNull();
	});

	it('dedupes repeated emails regardless of case', () => {
		const out = parseMembers(
			headers,
			rowsOf({ email: 'jane@acme.com' }, { email: 'JANE@acme.com' }, { email: 'sam@acme.com' })
		);
		expect(out.map((m) => m.email)).toEqual(['jane@acme.com', 'sam@acme.com']);
	});
});

describe('parseProducts', () => {
	it('returns nothing unless style, name and price all map', () => {
		expect(parseProducts(['style number', 'name'], rowsOf({}))).toEqual([]);
	});

	it('parses a well-formed row and leaves optional fields unset', () => {
		const out = parseProducts(
			['style number', 'name', 'wholesale price'],
			rowsOf({ 'style number': 'ST-1', name: 'Silk Blouse', 'wholesale price': '$120' })
		);
		expect(out).toEqual([
			{
				style_number: 'ST-1',
				name: 'Silk Blouse',
				wholesale_price: 120,
				season_id: null,
				retail_price: null,
				category: null,
				subcategory: null,
				description: null,
				image_url: null,
				sizes: [],
				colors: [],
				season_name: null,
				product_year: null
			}
		]);
	});

	it('carries every column the import endpoint accepts', () => {
		const out = parseProducts(
			[
				'style_number',
				'name',
				'wholesale_price',
				'retail_price',
				'category',
				'subcategory',
				'sizes',
				'colors',
				'description',
				'season',
				'product_year',
				'image'
			],
			rowsOf({
				style_number: 'FA26-301',
				name: 'The Vivienne Silk Blouse',
				wholesale_price: '162',
				retail_price: '405',
				category: 'Tops',
				subcategory: 'Blouse',
				sizes: 'XS, S, M, L, XL',
				colors: '',
				description: 'Burgundy silk crepe with tie neck.',
				season: 'Fall',
				product_year: '2026',
				image: 'https://example.com/a.png'
			})
		);
		expect(out).toEqual([
			{
				style_number: 'FA26-301',
				name: 'The Vivienne Silk Blouse',
				wholesale_price: 162,
				season_id: null,
				retail_price: 405,
				category: 'Tops',
				subcategory: 'Blouse',
				description: 'Burgundy silk crepe with tie neck.',
				image_url: 'https://example.com/a.png',
				sizes: ['XS', 'S', 'M', 'L', 'XL'],
				colors: [],
				season_name: 'Fall',
				product_year: 2026
			}
		]);
	});

	it('splits delimited size and color columns into arrays', () => {
		const out = parseProducts(
			['style number', 'name', 'wholesale price', 'sizes', 'colors'],
			rowsOf({
				'style number': 'ST-1',
				name: 'Silk Blouse',
				'wholesale price': '120',
				sizes: 'XS, S, M ,L',
				colors: 'Black;Navy|Black'
			})
		);
		expect(out[0].sizes).toEqual(['XS', 'S', 'M', 'L']);
		expect(out[0].colors).toEqual(['Black', 'Navy']);
	});

	it('ignores an out-of-range product year', () => {
		const out = parseProducts(
			['style number', 'name', 'wholesale price', 'product year'],
			rowsOf({
				'style number': 'ST-1',
				name: 'Silk Blouse',
				'wholesale price': '120',
				'product year': '26'
			})
		);
		expect(out[0].product_year).toBeNull();
	});

	it('drops rows missing any required value', () => {
		const out = parseProducts(
			['style number', 'name', 'wholesale price'],
			rowsOf(
				{ 'style number': '', name: 'No Style', 'wholesale price': '10' },
				{ 'style number': 'ST-2', name: '', 'wholesale price': '10' },
				{ 'style number': 'ST-3', name: 'No Price', 'wholesale price': 'free' },
				{ 'style number': 'ST-4', name: 'Blank Price', 'wholesale price': '' }
			)
		);
		expect(out).toEqual([]);
	});
});

describe('parseOrders', () => {
	const headers = ['account', 'style number', 'qty', 'unit price', 'color', 'size'];

	it('requires account, style and qty columns', () => {
		expect(parseOrders(['account', 'qty'], rowsOf({}))).toEqual([]);
	});

	it('drops non-positive and unparseable quantities', () => {
		const out = parseOrders(
			headers,
			rowsOf(
				{ account: 'Acme', 'style number': 'ST-1', qty: '0' },
				{ account: 'Acme', 'style number': 'ST-1', qty: '-2' },
				{ account: 'Acme', 'style number': 'ST-1', qty: 'many' }
			)
		);
		expect(out).toEqual([]);
	});

	it('truncates fractional quantities and nulls blank optionals', () => {
		const [o] = parseOrders(
			headers,
			rowsOf({ account: 'Acme', 'style number': 'ST-1', qty: '2.7', color: '', size: ' M ' })
		);
		expect(o.qty).toBe(2);
		expect(o.color).toBeNull();
		expect(o.size).toBe('M');
		expect(o.unit_price).toBeNull();
	});
});

describe('capRows', () => {
	it('passes through when under the ceiling', () => {
		expect(capRows([1, 2, 3])).toEqual({ rows: [1, 2, 3], dropped: 0 });
	});

	it('truncates and reports the overflow', () => {
		const many = Array.from({ length: MAX_IMPORT_ROWS + 7 }, (_, i) => i);
		const { rows, dropped } = capRows(many);
		expect(rows).toHaveLength(MAX_IMPORT_ROWS);
		expect(dropped).toBe(7);
	});
});

describe('importedCount', () => {
	it('reads `created` for accounts and orders', () => {
		expect(importedCount('accounts', { created: 2, skipped: [], errors: [] })).toBe(2);
		expect(importedCount('orders', { created: 7, skipped: [], errors: [] })).toBe(7);
	});

	it('reads inserted + updated for products, which has no `created`', () => {
		// The exact payload that displayed "0 Products Added" for 15 products.
		const productsResult = { inserted: 15, updated: 0, skipped: 0, imageFailures: [] };
		expect(importedCount('products', productsResult)).toBe(15);
		expect(importedCount('products', { inserted: 3, updated: 2 })).toBe(5);
	});

	it('never reports a count for a field the endpoint does not send', () => {
		expect(importedCount('products', { created: 15 })).toBe(0);
		expect(importedCount('accounts', { inserted: 15 })).toBe(0);
	});

	it('is safe on missing or malformed results', () => {
		expect(importedCount('accounts', null)).toBe(0);
		expect(importedCount('accounts', {})).toBe(0);
		expect(importedCount('products', { inserted: 'x' })).toBe(0);
	});
});

describe('parseProducts — exploded exports', () => {
	// One row per style x size, the shape JOOR and NuOrder export.
	const headers = ['Style Number', 'Style Name', 'Wholesale Price', 'Size Name', 'Color Name'];
	const row = (style: string, name: string, price: string, size: string, color: string) => ({
		'style number': style,
		'style name': name,
		'wholesale price': price,
		'size name': size,
		'color name': color
	});

	it('collapses rows to one product per style and unions the sizes', () => {
		const out = parseProducts(
			headers,
			rowsOf(
				row('ST-1', 'Sophie Blouse', '154', 'S', 'Black'),
				row('ST-1', 'Sophie Blouse', '154', 'M', 'Black'),
				row('ST-1', 'Sophie Blouse', '154', 'L', 'Ivory'),
				row('ST-2', 'Margot Coat', '410', 'M', 'Camel')
			)
		);
		expect(out).toHaveLength(2);
		expect(out[0].style_number).toBe('ST-1');
		expect(out[0].sizes).toEqual(['S', 'M', 'L']);
		expect(out[0].colors).toEqual(['Black', 'Ivory']);
		expect(out[1].sizes).toEqual(['M']);
	});

	it('backfills a scalar the first row of a style left blank', () => {
		const out = parseProducts(
			[...headers, 'Description'],
			rowsOf(
				{ ...row('ST-1', 'Sophie', '154', 'S', 'Black'), description: '' },
				{ ...row('ST-1', 'Sophie', '154', 'M', 'Black'), description: 'Silk blouse.' }
			)
		);
		expect(out).toHaveLength(1);
		expect(out[0].description).toBe('Silk blouse.');
	});

	it('treats a flat one-row-per-product CSV as groups of one', () => {
		const out = parseProducts(
			['style_number', 'name', 'wholesale_price', 'sizes'],
			rowsOf(
				{ style_number: 'A', name: 'Alpha', wholesale_price: '10', sizes: 'S, M' },
				{ style_number: 'B', name: 'Beta', wholesale_price: '20', sizes: 'L' }
			)
		);
		expect(out).toHaveLength(2);
		expect(out[0].sizes).toEqual(['S', 'M']);
	});

	it('picks the price column over the currency column', () => {
		const out = parseProducts(
			['Style Number', 'Style Name', 'Wholesale Currency', 'Wholesale Price'],
			rowsOf({
				'style number': 'ST-1',
				'style name': 'Sophie',
				'wholesale currency': 'USD',
				'wholesale price': '154.00'
			})
		);
		expect(out).toHaveLength(1);
		expect(out[0].wholesale_price).toBe(154);
	});
});

describe('parseProducts — sparse continuation rows', () => {
	it('keeps sizes from rows that repeat only the style number', () => {
		// Merged-cell exports carry name and price on the first row of a style
		// and leave them blank on the rest. Those rows still carry a size.
		const out = parseProducts(
			['Style Number', 'Style Name', 'Wholesale Price', 'Size Name'],
			rowsOf(
				{
					'style number': 'ST-1',
					'style name': 'Sophie',
					'wholesale price': '154',
					'size name': 'S'
				},
				{ 'style number': 'ST-1', 'style name': '', 'wholesale price': '', 'size name': 'M' },
				{ 'style number': 'ST-1', 'style name': '', 'wholesale price': '', 'size name': 'L' }
			)
		);
		expect(out).toHaveLength(1);
		expect(out[0].sizes).toEqual(['S', 'M', 'L']);
	});

	it('picks up sizes that appeared before the row supplying name and price', () => {
		const out = parseProducts(
			['Style Number', 'Style Name', 'Wholesale Price', 'Size Name'],
			rowsOf(
				{ 'style number': 'ST-1', 'style name': '', 'wholesale price': '', 'size name': 'S' },
				{
					'style number': 'ST-1',
					'style name': 'Sophie',
					'wholesale price': '154',
					'size name': 'M'
				}
			)
		);
		expect(out).toHaveLength(1);
		expect(out[0].sizes).toEqual(['S', 'M']);
	});

	it('does not emit a product for a style no row ever named or priced', () => {
		const out = parseProducts(
			['Style Number', 'Style Name', 'Wholesale Price', 'Size Name'],
			rowsOf({ 'style number': 'ST-9', 'style name': '', 'wholesale price': '', 'size name': 'M' })
		);
		expect(out).toEqual([]);
	});
});
