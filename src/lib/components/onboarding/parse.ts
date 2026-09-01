// CSV parsers for the preflight import steps. Pure functions, no Svelte or DOM,
// so the header-matching and row-filtering rules can be tested directly — they
// previously lived inside +page.svelte and were untestable by construction.

import { mapProductHeaders } from '$lib/utils/csv-column-suggest';

export type MemberDraft = {
	email: string;
	role: string;
	commissionRate: number | null;
	name: string;
};

export type BrandDraft = {
	name: string;
	contact_first_name: string | null;
	contact_last_name: string | null;
	contact_email: string | null;
	contact_phone: string | null;
	website: string | null;
	notes: string | null;
	commission_rate: number;
};

export type ProductDraft = {
	style_number: string;
	name: string;
	wholesale_price: number;
	season_id: string | null;
	retail_price: number | null;
	category: string | null;
	subcategory: string | null;
	description: string | null;
	image_url: string | null;
	/** Size run for the style. Empty means the import had no size column —
	 * the product lands with zero product_variants rows, which leaves it
	 * unpickable in the catalog picker and unexpandable in order edit mode. */
	sizes: string[];
	colors: string[];
	/** Raw season name off the import ("Fall", "Fall 2026"). Resolved to a
	 * real seasons.id at post time via matchSeasonId — parsing is pure and
	 * has no access to the org's season list. */
	season_name: string | null;
	product_year: number | null;
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
 * Brands, for the rep's "brands you carry" step. Name is the only required
 * column. Rows are deduped by lowercased name so a repeated brand doesn't
 * become two local records; the endpoint dedupes against the org as well.
 *
 * A single "contact name" column is split on the first space, which is how
 * the same field is handled everywhere else the app takes one: brands store
 * contact_first_name / contact_last_name.
 */
export function parseBrands(headers: string[], rows: Record<string, string>[]): BrandDraft[] {
	const nameH = pickHeader(headers, ['brand', 'brand name', 'brand_name', 'name']);
	if (!nameH) return [];
	const firstH = pickHeader(headers, [
		'contact first name',
		'contact_first_name',
		'first name',
		'first_name',
		'firstname'
	]);
	const lastH = pickHeader(headers, [
		'contact last name',
		'contact_last_name',
		'last name',
		'last_name',
		'lastname'
	]);
	const contactH = pickHeader(headers, ['contact', 'contact name', 'contact_name']);
	const emailH = pickHeader(headers, ['email', 'contact email', 'contact_email', 'email address']);
	const phoneH = pickHeader(headers, ['phone', 'contact phone', 'contact_phone', 'phone number']);
	const websiteH = pickHeader(headers, ['website', 'url', 'site', 'web']);
	const notesH = pickHeader(headers, ['notes', 'note', 'comments']);
	const commH = pickHeader(headers, ['commission', 'commission rate', 'commission_rate']);

	const cell = (row: Record<string, string>, h: string | null): string =>
		h ? (row[h] ?? '').trim() : '';

	const out: BrandDraft[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const name = cell(row, nameH);
		if (!name) continue;
		const dedupeKey = name.toLowerCase();
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);

		let first = cell(row, firstH);
		let last = cell(row, lastH);
		if (!first && !last) {
			const whole = cell(row, contactH);
			if (whole) {
				const spaceAt = whole.indexOf(' ');
				first = spaceAt === -1 ? whole : whole.slice(0, spaceAt);
				last = spaceAt === -1 ? '' : whole.slice(spaceAt + 1).trim();
			}
		}

		// A percentage cell may arrive as "12%", "12" or "0.12". Only the first
		// two are meaningful as a rate here, and anything out of 0-100 is
		// dropped rather than clamped so a mis-mapped column can't set 100%.
		let commission_rate = 0;
		if (commH) {
			const raw = toNumber((row[commH] ?? '').replace('%', ''));
			if (raw !== null && raw >= 0 && raw <= 100) commission_rate = raw;
		}

		out.push({
			name,
			contact_first_name: first || null,
			contact_last_name: last || null,
			contact_email: cell(row, emailH) || null,
			contact_phone: cell(row, phoneH) || null,
			website: cell(row, websiteH) || null,
			notes: cell(row, notesH) || null,
			commission_rate
		});
	}
	return out;
}

function toYear(cell: string): number | null {
	const n = toNumber(cell);
	if (n === null) return null;
	const y = Math.trunc(n);
	return y >= 1900 && y <= 2200 ? y : null;
}

/**
 * Split a delimited cell ("S, M, L" / "Black;Navy") into unique trimmed
 * values. Mirrors the delimiters accepted by `flexibleStringArray` in
 * src/lib/schemas/product-import.ts so the preview and the server agree.
 */
function splitList(cell: string | undefined): string[] {
	if (!cell) return [];
	return Array.from(
		new Set(
			cell
				.split(/[,;|]/)
				.map((s) => s.trim())
				.filter((s) => s.length > 0)
		)
	);
}

/**
 * Products, via the app's shared column mapper.
 *
 * Two things this has to survive beyond a hand-made CSV:
 *
 * 1. WIDE EXPORTS. A JOOR line sheet is 92 columns. Per-header greedy matching
 *    hands `style_number` to "Collection Styles Comment" and `wholesale_price`
 *    to "Wholesale Currency_1", so every row fails to parse and the import
 *    reports "I couldn't read that catalog". `mapProductHeaders` scores all
 *    pairs and assigns globally, and checks values, so the right columns win.
 *
 * 2. EXPLODED ROWS. Those exports carry one row per style x size x color, so
 *    641 rows describe 87 products. Rows are grouped by style number; scalars
 *    take the first non-empty value and sizes/colors union across the group.
 *    A flat one-row-per-product CSV is just the degenerate case of a group of
 *    one, so both shapes go through the same path.
 *
 * Every field `productDraftSchema` accepts is read. Only style_number, name
 * and wholesale_price are required.
 */
export function parseProducts(headers: string[], rows: Record<string, string>[]): ProductDraft[] {
	const headerByField = mapProductHeaders(headers, rows);

	const styleH = headerByField.get('style_number');
	const nameH = headerByField.get('name');
	const priceH = headerByField.get('wholesale_price');
	if (!styleH || !nameH || !priceH) return [];

	const retailH = headerByField.get('retail_price');
	const categoryH = headerByField.get('category');
	const subcategoryH = headerByField.get('subcategory');
	const descriptionH = headerByField.get('description');
	const imageH = headerByField.get('image_url');
	const sizesH = headerByField.get('sizes');
	const colorsH = headerByField.get('colors');
	const seasonH = headerByField.get('season');
	const yearH = headerByField.get('product_year');

	const cell = (row: Record<string, string>, h: string | undefined): string =>
		h ? (row[h] ?? '').trim() : '';

	const byStyle = new Map<string, ProductDraft>();
	const sizesByStyle = new Map<string, Set<string>>();
	const colorsByStyle = new Map<string, Set<string>>();

	const collect = (into: Map<string, Set<string>>, key: string, values: string[]) => {
		if (values.length === 0) return;
		let set = into.get(key);
		if (!set) {
			set = new Set<string>();
			into.set(key, set);
		}
		for (const v of values) set.add(v);
	};

	for (const row of rows) {
		const style_number = cell(row, styleH);
		if (!style_number) continue;

		// Sizes and colors accumulate from EVERY row carrying the style number,
		// including continuation rows that leave name and price blank. Exports
		// built from merged cells repeat only the style and its size per row,
		// so requiring name+price here would drop those sizes from the run.
		// A cell may hold one value ("M") or a delimited run ("S, M, L").
		collect(sizesByStyle, style_number, splitList(cell(row, sizesH)));
		collect(colorsByStyle, style_number, splitList(cell(row, colorsH)));

		const draft = byStyle.get(style_number);
		if (!draft) {
			const name = cell(row, nameH);
			const price = toNumber(cell(row, priceH));
			// A style only becomes a product once some row supplies name+price.
			if (!name || price === null) continue;
			byStyle.set(style_number, {
				style_number,
				name,
				wholesale_price: price,
				season_id: null,
				retail_price: retailH ? toNumber(cell(row, retailH)) : null,
				category: cell(row, categoryH) || null,
				subcategory: cell(row, subcategoryH) || null,
				description: cell(row, descriptionH) || null,
				image_url: cell(row, imageH) || null,
				sizes: [],
				colors: [],
				season_name: cell(row, seasonH) || null,
				product_year: yearH ? toYear(cell(row, yearH)) : null
			});
		} else {
			// Later rows of the same style backfill anything the first row left
			// blank — exports often carry the description or image on one row only.
			draft.retail_price ??= retailH ? toNumber(cell(row, retailH)) : null;
			draft.category ??= cell(row, categoryH) || null;
			draft.subcategory ??= cell(row, subcategoryH) || null;
			draft.description ??= cell(row, descriptionH) || null;
			draft.image_url ??= cell(row, imageH) || null;
			draft.season_name ??= cell(row, seasonH) || null;
			draft.product_year ??= yearH ? toYear(cell(row, yearH)) : null;
		}
	}

	for (const [style_number, draft] of byStyle) {
		draft.sizes = [...(sizesByStyle.get(style_number) ?? [])];
		draft.colors = [...(colorsByStyle.get(style_number) ?? [])];
	}
	return [...byStyle.values()];
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
