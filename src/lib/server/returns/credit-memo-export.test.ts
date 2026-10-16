import { describe, expect, it } from 'vitest';
import { creditMemoCsv, spreadsheetSafe, type CreditMemoExportRow } from './credit-memo-export.js';

const row = (over: Partial<CreditMemoExportRow> = {}): CreditMemoExportRow => ({
	credit_memo_number: 'CM-ACM-00001',
	credit_memo_issued_at: '2026-10-16T19:04:11.123Z',
	ra_number: 'RA-ACM-00001',
	credit_subtotal: 200,
	restocking_fee: 10,
	shipping_deduction: 12.5,
	credit_tax: 0,
	credit_total: 177.5,
	accounts: { business_name: 'Bloom Boutique' },
	brands: { name: 'Acme' },
	applied: null,
	...over
});

const parse = (csv: string) => csv.trimEnd().split('\r\n');

describe('creditMemoCsv', () => {
	it('writes the header even with no memos, so an empty period still opens', () => {
		expect(parse(creditMemoCsv([]))).toEqual([
			'Credit memo,Issued,Return,Account,Brand,Credits invoice,Merchandise,Restocking fee,Return shipping,Tax,Tax included,Credit'
		]);
	});

	it('writes money to the cent, as text', () => {
		const [, line] = parse(creditMemoCsv([row()]));
		expect(line).toBe(
			'CM-ACM-00001,2026-10-16,RA-ACM-00001,Bloom Boutique,Acme,,200.00,10.00,12.50,0.00,No,177.50'
		);
	});

	it('reads NUMERIC columns that arrive as strings', () => {
		const [, line] = parse(
			creditMemoCsv([row({ credit_subtotal: '1234.5', credit_total: '1234.50' })])
		);
		expect(line).toContain(',1234.50,');
		expect(line.endsWith(',1234.50')).toBe(true);
	});

	it('foots: merchandise minus deductions plus added tax equals credit on every row', () => {
		const rows = [
			row(),
			row({
				credit_subtotal: 99.99,
				restocking_fee: 0.01,
				shipping_deduction: 0,
				credit_tax: 8.25,
				credit_total: 108.23
			}),
			row({
				credit_subtotal: 0.3,
				restocking_fee: 0.1,
				shipping_deduction: 0.1,
				credit_tax: 0,
				credit_total: 0.1
			})
		];
		for (const line of parse(creditMemoCsv(rows)).slice(1)) {
			const c = line.split(',');
			const [sub, fee, ship, tax] = c.slice(6, 10).map((v) => Math.round(Number(v) * 100));
			const added = c[10] === 'Yes' ? 0 : tax;
			expect(sub - fee - ship + added).toBe(Math.round(Number(c[11]) * 100));
		}
	});

	it('marks inclusive tax, which is on the memo but not in the credit', () => {
		const [, line] = parse(
			creditMemoCsv([
				row({ credit_tax: 16, credit_total: 177.5, applied: { invoice_number: 'INV-1' } })
			])
		);
		expect(line).toContain(',INV-1,');
		expect(line).toContain(',16.00,Yes,177.50');
	});

	it('quotes names with commas and quotes', () => {
		const [, line] = parse(
			creditMemoCsv([row({ accounts: { business_name: 'Smith, "Jones" & Co' } })])
		);
		expect(line).toContain(',"Smith, ""Jones"" & Co",');
	});
});

describe('spreadsheetSafe', () => {
	it('defuses a name a spreadsheet would execute', () => {
		for (const evil of ['=HYPERLINK("x")', '+cmd', '-2+3', '@SUM(A1)', '\tx', '\rx']) {
			expect(spreadsheetSafe(evil).startsWith("'")).toBe(true);
		}
	});

	it('leaves ordinary names alone', () => {
		expect(spreadsheetSafe('Bloom Boutique')).toBe('Bloom Boutique');
		expect(spreadsheetSafe(null)).toBe('');
	});
});
