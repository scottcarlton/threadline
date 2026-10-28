// Pure helpers shared by every surface that runs the product import flow
// (onboarding catalog step, /products bulk-import modal, anywhere else
// that lands a CSV/PDF batch into the import endpoint). The stateful UI
// logic lives in `ProductImportFlow.svelte`; everything in this file is
// side-effect-free or self-contained.

import { mapProductHeaders } from '$lib/utils/csv-column-suggest.js';

// ─── Loading-state pacing ─────────────────────────────────────────────
// Each loading stage stays visible for at least the per-stage minimum,
// and the total flow is held above TOTAL_LOADING_MIN_MS regardless of
// how fast the underlying work returns. This is intentional UX — even
// instant CSV parses get a "we did real work" moment, and the image
// preload below has time to warm the browser cache before the preview
// transition.

export const SCANNING_MIN_MS = 1500;
export const PARSING_MIN_MS = 1500;
export const PREPARING_MIN_MS = 1500;
export const TOTAL_LOADING_MIN_MS = 6000;
export const IMAGE_PRELOAD_TIMEOUT_MS = 4000;

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureMinElapsed(stageStart: number, minMs: number): Promise<void> {
	const remaining = minMs - (Date.now() - stageStart);
	if (remaining > 0) await sleep(remaining);
}

// ─── Image URL normalization ──────────────────────────────────────────
// Dropbox sharing URLs default to `www.dropbox.com/...?dl=0`, which
// renders an HTML preview page (no good for <img src>) AND adds a 302
// hop to the real CDN. Rewrite directly to dl.dropboxusercontent.com so
// the browser hits the CDN once with no redirect.

export function normalizeImageUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const v = raw.trim();
	if (!v) return null;
	if (/^https?:\/\/(www\.)?dropbox\.com\//.test(v)) {
		return v
			.replace(/^https?:\/\/(www\.)?dropbox\.com\//, 'https://dl.dropboxusercontent.com/')
			.replace(/([?&])dl=\d(&|$)/, (_m, p1, p2) => (p2 ? p1 : ''))
			.replace(/[?&]$/, '');
	}
	return v;
}

// Pre-warm the browser image cache for the visible preview thumbs.
// Doesn't block on a single slow URL — Promise.race against a hard cap.
export function preloadPreviewImages(rows: Record<string, unknown>[]): Promise<void> {
	const urls = rows
		.slice(0, 10)
		.map((r) => normalizeImageUrl(r.image_url))
		.filter((u): u is string => !!u);
	if (urls.length === 0) return Promise.resolve();
	const all = Promise.allSettled(
		urls.map(
			(src) =>
				new Promise<void>((resolve) => {
					const img = new Image();
					img.onload = () => resolve();
					img.onerror = () => resolve();
					img.src = src;
				})
		)
	).then(() => undefined);
	return Promise.race([all, sleep(IMAGE_PRELOAD_TIMEOUT_MS)]);
}

// ─── CSV → preview row shape ─────────────────────────────────────────
// Auto-map CSV headers to product fields and return one preview row per
// product + the headers that didn't map. Anything missing required fields
// surfaces server-side at commit time.
//
// Files come in two shapes, and both go through the same path:
//   - one row per product, sizes and colors as lists ("S, M, L")
//   - one row per variant (size x color), often with a SKU per row
// Rows are grouped by style number, so the second shape lands as one
// product with its variants. A file of the first shape is just groups of
// one.

export type PreviewBuild = {
	previewRows: Record<string, unknown>[];
	previewUnmapped: string[];
};

// A variant SKU column. Matched separately because `sku` is also a style
// number synonym: in a file that has both, the style column groups the
// product and the SKU belongs on each variant.
const SKU_HEADERS = new Set(['sku', 'variantsku', 'skunumber', 'skuno']);

function splitList(cell: string): string[] {
	return Array.from(
		new Set(
			cell
				.split(/[,;|]/)
				.map((s) => s.trim())
				.filter((s) => s.length > 0)
		)
	);
}

type VariantDraft = { size: string | null; color: string | null; sku: string | null };

type Group = {
	row: Record<string, unknown>;
	sizes: Set<string>;
	colors: Set<string>;
	variants: VariantDraft[];
	// False once any row can't be read as a single variant (a list cell or a
	// missing SKU). The server then falls back to sizes x colors.
	explicit: boolean;
};

const LIST_FIELDS = new Set(['sizes', 'colors']);

export function buildPreviewFromCsv(
	headers: string[],
	rows: Record<string, string>[]
): PreviewBuild {
	const headerByField = mapProductHeaders(headers, rows);
	const mappedHeaders = new Set(headerByField.values());
	const skuHeader = headers
		.map((h) => h.trim().toLowerCase())
		.find((h) => !mappedHeaders.has(h) && SKU_HEADERS.has(h.replace(/[^a-z0-9]/g, '')));

	const styleHeader = headerByField.get('style_number');
	const sizeHeader = headerByField.get('sizes');
	const colorHeader = headerByField.get('colors');
	const cell = (row: Record<string, string>, h: string | undefined) =>
		h ? (row[h] ?? '').trim() : '';

	const groups: Group[] = [];
	const byStyle = new Map<string, Group>();

	for (const row of rows) {
		const style = cell(row, styleHeader);
		const sizes = splitList(cell(row, sizeHeader));
		const colors = splitList(cell(row, colorHeader));
		const sku = cell(row, skuHeader) || null;

		let group = style ? byStyle.get(style) : undefined;
		if (!group) {
			group = { row: {}, sizes: new Set(), colors: new Set(), variants: [], explicit: true };
			groups.push(group);
			// A row with no style number can't be grouped. It stays on its own
			// so the server names it in the error.
			if (style) byStyle.set(style, group);
		}

		// First non-empty value wins per field. Exports often carry the
		// description or image on one row of the style only.
		for (const [field, header] of headerByField) {
			if (LIST_FIELDS.has(field)) continue;
			const value = cell(row, header);
			if (!group.row[field] && value) group.row[field] = value;
			else if (!(field in group.row)) group.row[field] = '';
		}
		for (const s of sizes) group.sizes.add(s);
		for (const c of colors) group.colors.add(c);

		if (!skuHeader || !sku || sizes.length > 1 || colors.length > 1) {
			if (sizes.length > 0 || colors.length > 0 || sku) group.explicit = false;
		} else {
			group.variants.push({ size: sizes[0] ?? null, color: colors[0] ?? null, sku });
		}
	}

	const previewRows = groups.map((g) => {
		const out: Record<string, unknown> = { ...g.row };
		if (sizeHeader) out.sizes = [...g.sizes];
		if (colorHeader) out.colors = [...g.colors];
		if (g.explicit && g.variants.length > 0) out.variants = g.variants;
		return out;
	});

	const previewUnmapped = headers.filter((h) => {
		const key = h.trim().toLowerCase();
		return !mappedHeaders.has(key) && key !== skuHeader;
	});
	return { previewRows, previewUnmapped };
}

// ─── Display formatters ──────────────────────────────────────────────

const previewMoneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatPreviewPrice(v: unknown): string {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? previewMoneyFmt.format(n) : '';
}

// ─── CSV template download ───────────────────────────────────────────
// Canonical columns matching the auto-mapper aliases. Order is "required
// first, then most-likely-edited fields, then optional details" so the
// user sees what matters when the file opens in Sheets/Excel. The
// example row uses realistic values so empty/blank fields are easy to
// distinguish from real data.

const TEMPLATE_HEADERS = [
	'style_number',
	'name',
	'wholesale_price',
	'retail_price',
	'category',
	'subcategory',
	'season',
	'product_year',
	'sizes',
	'colors',
	'image_url',
	'description'
];

const TEMPLATE_EXAMPLE_ROW = [
	'CT-01',
	'Crew Tee',
	'24.00',
	'48.00',
	'Tops',
	'Knits',
	'Fall',
	'2026',
	'XS, S, M, L, XL',
	'Black, White',
	'https://example.com/crew-tee.jpg',
	'Soft cotton crew-neck tee.'
];

function csvCell(v: string): string {
	// Quote anything that contains a delimiter, quote, or newline. Embedded
	// quotes are escaped by doubling them — standard CSV.
	if (/["\n,]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
	return v;
}

function csvRow(cells: string[]): string {
	return cells.map(csvCell).join(',');
}

export function downloadCsvTemplate(filename = 'threadline-products-template.csv'): void {
	// Leading BOM (U+FEFF) signals UTF-8 to Excel — without it, Excel
	// often guesses Windows-1252 and mangles non-ASCII characters.
	const csv = '\uFEFF' + [csvRow(TEMPLATE_HEADERS), csvRow(TEMPLATE_EXAMPLE_ROW)].join('\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// ─── Season + year detection ─────────────────────────────────────────
// Cascade: filename → mapped CSV columns → raw text scan → AI hints.
// First non-null source wins per field (season name and year resolve
// independently — filename can supply the season while AI fills in the
// year, or vice versa).

export type Season = { id: string; name: string };
export type ImportHint = { seasonName: string | null; year: number | null };

// Recognizes common fashion linesheet naming (FA26, FW2026, SS-26,
// Spring 2026, Resort_2026, Holiday26, etc.). Two-digit years expand
// to 20YY. Match returns the first season pattern found.
const SEASON_PATTERNS: { regex: RegExp; name: string }[] = [
	{ regex: /\b(?:FA|FW|FALL|AUTUMN)\s*[-_ ]?\s*(\d{2,4})/i, name: 'Fall' },
	{ regex: /\b(?:SS|SP|SPR|SPRING)\s*[-_ ]?\s*(\d{2,4})/i, name: 'Spring' },
	{ regex: /\b(?:SU|SUM|SUMMER)\s*[-_ ]?\s*(\d{2,4})/i, name: 'Summer' },
	{ regex: /\b(?:RE|RES|RESORT|CRUISE)\s*[-_ ]?\s*(\d{2,4})/i, name: 'Resort' },
	{ regex: /\b(?:HO|HOL|HOLIDAY|XMAS)\s*[-_ ]?\s*(\d{2,4})/i, name: 'Holiday' }
];

function expandYear(raw: string): number | null {
	const n = parseInt(raw, 10);
	if (!Number.isFinite(n)) return null;
	if (n >= 1900 && n <= 2200) return n;
	if (n >= 0 && n <= 99) return 2000 + n;
	return null;
}

export function detectHintFromText(text: string): ImportHint {
	if (!text) return { seasonName: null, year: null };
	for (const { regex, name } of SEASON_PATTERNS) {
		const m = text.match(regex);
		if (m) return { seasonName: name, year: expandYear(m[1]) };
	}
	// No season pattern; fall back to a bare 4-digit year (1900–2199).
	// Lookarounds (not \b) so an underscore-flanked year like
	// `catalog_2026.pdf` still matches — `_` counts as a word char to \b.
	const y = text.match(/(?<!\d)(?:19|20|21)\d{2}(?!\d)/);
	return { seasonName: null, year: y ? parseInt(y[0], 10) : null };
}

export function detectHintFromCsvRows(rows: Record<string, unknown>[]): ImportHint {
	const first = rows[0] ?? {};
	const seasonName =
		typeof first.season === 'string' && first.season.trim() ? first.season.trim() : null;
	const yRaw = first.product_year;
	const yNum = typeof yRaw === 'number' ? yRaw : Number(yRaw);
	const year = Number.isFinite(yNum) && yNum > 0 ? yNum : null;
	return { seasonName, year };
}

// Take the first non-null source per field. Inputs are passed in
// priority order (highest first).
export function mergeHints(...hints: ImportHint[]): ImportHint {
	return {
		seasonName: hints.find((h) => h.seasonName)?.seasonName ?? null,
		year: hints.find((h) => h.year != null)?.year ?? null
	};
}

// Fuzzy bidirectional substring — case-insensitive. Returns the season
// whose name contains, or is contained by, `detectedName`.
export function matchSeasonId(detectedName: string | null, seasons: Season[]): string | null {
	if (!detectedName) return null;
	const needle = detectedName.toLowerCase();
	for (const s of seasons) {
		const hay = s.name.toLowerCase();
		if (hay.includes(needle) || needle.includes(hay)) return s.id;
	}
	return null;
}

// Year picker options: current year ±2.
export function yearOptions(): number[] {
	const y = new Date().getFullYear();
	return [y - 2, y - 1, y, y + 1, y + 2];
}
