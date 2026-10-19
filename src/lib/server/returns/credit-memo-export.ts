import { escapeCSVValue } from '$lib/utils/csv';
import { taxWasIncluded } from '$lib/server/returns/credit-memo-document';

/**
 * Issued credit memos as CSV, for an accountant to reconcile against.
 *
 * Pure: rows in, text out. The endpoint does the reading and the authorizing.
 */

export type CreditMemoExportRow = {
	credit_memo_number: string;
	credit_memo_issued_at: string | null;
	ra_number: string | null;
	credit_subtotal: number | string;
	restocking_fee: number | string;
	shipping_deduction: number | string;
	credit_tax: number | string;
	credit_total: number | string;
	accounts: { business_name: string | null } | null;
	brands: { name: string | null } | null;
	applied: { invoice_number: string | null } | null;
};

export const CREDIT_MEMO_CSV_HEADERS = [
	'Credit memo',
	'Issued',
	'Return',
	'Account',
	'Brand',
	'Credits invoice',
	'Merchandise',
	'Restocking fee',
	'Return shipping',
	'Tax',
	'Tax included',
	'Credit'
] as const;

/**
 * Neutralises text a spreadsheet would run as a formula.
 *
 * Account and brand names are typed in by people, and a cell beginning with
 * = + - @ (or a tab or carriage return) is executed by Excel and Sheets when
 * the file is opened. An accountant opening this export is exactly who that
 * attack targets. A leading apostrophe makes the cell plain text. Applied to
 * free text only: the money columns are formatted here and can never start
 * with one of those characters.
 */
export function spreadsheetSafe(text: string | null | undefined): string {
	if (!text) return '';
	return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/**
 * Exactly two decimals, from the stored NUMERIC(12,2). Written as text so a
 * spreadsheet reads 177.50, not a float it re-rounds, and every row foots to
 * the cent.
 */
function cents(value: number | string | null | undefined): string {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

/** Issue date in the account's books: the calendar day, UTC, as YYYY-MM-DD. */
function day(value: string | null): string {
	return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export function creditMemoCsv(rows: CreditMemoExportRow[]): string {
	const lines = [CREDIT_MEMO_CSV_HEADERS.map(escapeCSVValue).join(',')];

	for (const r of rows) {
		const cells = [
			r.credit_memo_number,
			day(r.credit_memo_issued_at),
			r.ra_number ?? '',
			spreadsheetSafe(r.accounts?.business_name),
			spreadsheetSafe(r.brands?.name),
			r.applied?.invoice_number ?? '',
			cents(r.credit_subtotal),
			cents(r.restocking_fee),
			cents(r.shipping_deduction),
			cents(r.credit_tax),
			taxWasIncluded(r) ? 'Yes' : 'No',
			cents(r.credit_total)
		];
		lines.push(cells.map(escapeCSVValue).join(','));
	}

	// CRLF per RFC 4180, which is what Excel writes and reads most reliably.
	return lines.join('\r\n') + '\r\n';
}
