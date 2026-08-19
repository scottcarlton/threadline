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

	it('parses a well-formed row and leaves the season unset', () => {
		const out = parseProducts(
			['style number', 'name', 'wholesale price'],
			rowsOf({ 'style number': 'ST-1', name: 'Silk Blouse', 'wholesale price': '$120' })
		);
		expect(out).toEqual([
			{ style_number: 'ST-1', name: 'Silk Blouse', wholesale_price: 120, season_id: null }
		]);
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
