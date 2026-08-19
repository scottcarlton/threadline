// CSV parsers for the preflight import steps. Pure functions, no Svelte or DOM,
// so the header-matching and row-filtering rules can be tested directly — they
// previously lived inside +page.svelte and were untestable by construction.

import { suggestColumnMapping } from '$lib/utils/csv-column-suggest';

export type MemberDraft = {
	email: string;
	role: string;
	commissionRate: number | null;
	name: string;
};

export type ProductDraft = {
	style_number: string;
	name: string;
	wholesale_price: number;
	season_id: string | null;
};

export type OrderRowDraft = {
	account: string;
	style_number: string;
	qty: number;
	unit_price: number | null;
	color: string | null;
	size: string | null;
};

/** First header matching any candidate, compared case-insensitively. */
export function pickHeader(headers: string[], candidates: string[]): string | null {
	const lowered = headers.map((h) => h.trim().toLowerCase());
	for (const c of candidates) {
		const i = lowered.indexOf(c);
		if (i !== -1) return lowered[i];
	}
	return null;
}

export function normalizeRole(raw: string): string {
	const v = raw.trim().toLowerCase();
	if (v.includes('admin')) return 'admin';
	if (v.includes('sales')) return 'sales';
	if (v.includes('guest')) return 'guest';
	return 'member';
}

export const toNumber = (raw: string): number | null => {
	// Number('') is 0, not NaN — without the empty check a blank price column
	// imports as $0.00 instead of being treated as missing.
	const cleaned = (raw ?? '').replace(/[$,]/g, '').trim();
	if (!cleaned) return null;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : null;
};

/**
 * Members. Email is the only required column. Rows are deduped by lowercased
 * email — a duplicate would otherwise send a second invite that fails and gets
 * counted as an error.
 */
export function parseMembers(headers: string[], rows: Record<string, string>[]): MemberDraft[] {
	const emailH = pickHeader(headers, ['email', 'email address', 'email_address']);
	if (!emailH) return [];
	const firstH = pickHeader(headers, ['first name', 'first_name', 'firstname']);
	const lastH = pickHeader(headers, ['last name', 'last_name', 'lastname']);
	const roleH = pickHeader(headers, ['role', 'member role']);
	const commH = pickHeader(headers, ['commission', 'commission rate', 'commission_rate']);

	const out: MemberDraft[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const email = (row[emailH] ?? '').trim();
		if (!email || !email.includes('@')) continue;
		const dedupeKey = email.toLowerCase();
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		const role = roleH ? normalizeRole(row[roleH] ?? '') : 'member';
		let commissionRate: number | null = null;
		if (role === 'sales' && commH) {
			const n = Number((row[commH] ?? '').replace('%', '').trim());
			if (Number.isFinite(n) && n > 0) commissionRate = n;
		}
		const name = [firstH ? row[firstH] : '', lastH ? row[lastH] : '']
			.map((s) => (s ?? '').trim())
			.filter(Boolean)
			.join(' ');
		out.push({ email, role, commissionRate, name });
	}
	return out;
}

/**
 * Products, via the app's shared column-suggestion mapper so preflight accepts
 * the same headers as the /products import.
 */
export function parseProducts(headers: string[], rows: Record<string, string>[]): ProductDraft[] {
	const headerByField = new Map<string, string>();
	for (const h of headers) {
		const field = suggestColumnMapping(h);
		if (field && !headerByField.has(field)) headerByField.set(field, h.trim().toLowerCase());
	}
	const styleH = headerByField.get('style_number');
	const nameH = headerByField.get('name');
	const priceH = headerByField.get('wholesale_price');
	if (!styleH || !nameH || !priceH) return [];

	const out: ProductDraft[] = [];
	for (const row of rows) {
		const style_number = (row[styleH] ?? '').trim();
		const name = (row[nameH] ?? '').trim();
		const price = toNumber(row[priceH] ?? '');
		if (!style_number || !name || price === null) continue;
		out.push({ style_number, name, wholesale_price: price, season_id: null });
	}
	return out;
}

export function parseOrders(headers: string[], rows: Record<string, string>[]): OrderRowDraft[] {
	const accountH = pickHeader(headers, ['account', 'business name', 'business_name', 'customer']);
	const styleH = pickHeader(headers, ['style number', 'style_number', 'style', 'sku']);
	const qtyH = pickHeader(headers, ['qty', 'quantity', 'units']);
	if (!accountH || !styleH || !qtyH) return [];
	const priceH = pickHeader(headers, ['unit price', 'unit_price', 'price', 'wholesale price']);
	const colorH = pickHeader(headers, ['color', 'colour']);
	const sizeH = pickHeader(headers, ['size']);

	const out: OrderRowDraft[] = [];
	for (const row of rows) {
		const account = (row[accountH] ?? '').trim();
		const style_number = (row[styleH] ?? '').trim();
		const qty = toNumber(row[qtyH] ?? '');
		if (!account || !style_number || qty === null || qty <= 0) continue;
		out.push({
			account,
			style_number,
			qty: Math.trunc(qty),
			unit_price: priceH ? toNumber(row[priceH] ?? '') : null,
			color: colorH ? (row[colorH] ?? '').trim() || null : null,
			size: sizeH ? (row[sizeH] ?? '').trim() || null : null
		});
	}
	return out;
}

/**
 * Import row ceiling. Members sends real email, so an unbounded CSV is a
 * mailing accident waiting to happen; the other steps just write rows.
 */
export const MAX_IMPORT_ROWS = 500;

export function capRows<T>(rows: T[], max = MAX_IMPORT_ROWS): { rows: T[]; dropped: number } {
	if (rows.length <= max) return { rows, dropped: 0 };
	return { rows: rows.slice(0, max), dropped: rows.length - max };
}

// ── Import result counts ──────────────────────────────────────────────────
// The three import endpoints do NOT share a response shape:
//
//   accounts → { created, skipped[], errors[] }
//   orders   → { created, skipped[], errors[] }
//   products → { inserted, updated, skipped, imageFailures[] }   ← no `created`
//
// Reading `created` for all three reported "0 Products Added" after a
// successful 15-product import. Keep the mapping here, with tests, so a
// wrong assumption about a contract fails a test instead of lying in the UI.

export type ImportResult = Record<string, unknown>;

export function importedCount(subId: string, result: ImportResult | null | undefined): number {
	if (!result) return 0;
	const num = (v: unknown) => {
		const n = Number(v ?? 0);
		return Number.isFinite(n) ? n : 0;
	};
	if (subId === 'products') return num(result.inserted) + num(result.updated);
	return num(result.created);
}
