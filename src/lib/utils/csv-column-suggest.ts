// Fuzzy column-header → product-field-key suggestions for the CSV import
// mapping UI. The mapper renders one row per uploaded header and pre-fills
// the "Map to" dropdown with the suggested key (or "Skip" when no match).
//
// Match strategy:
//   1. Lowercase + strip non-alphanumeric (so "Style #", "style_number",
//      "STYLE NUMBER" all normalize to "stylenumber").
//   2. Exact match against any synonym for a field.
//   3. Substring match (the normalized header contains a synonym).
//   4. null → "Skip" by default; user can still override in the UI.

export type ProductFieldKey =
	| 'name'
	| 'style_number'
	| 'wholesale_price'
	| 'retail_price'
	| 'category'
	| 'subcategory'
	| 'description'
	| 'sizes'
	| 'colors'
	| 'season'
	| 'product_year'
	| 'image_url';

const SUGGESTIONS: Record<ProductFieldKey, string[]> = {
	// "stylename" is listed so it beats a bare "name" match elsewhere in the
	// file: a JOOR export carries both "Linesheet Name" (the collection) and
	// "Style Name" (the product), and the product is the one we want.
	name: ['name', 'stylename', 'productname', 'producttitle', 'item', 'itemname', 'title'],
	style_number: ['stylenumber', 'style', 'styleno', 'sku', 'itemnumber', 'itemno', 'styleid'],
	wholesale_price: ['wholesale', 'wholesaleprice', 'wsprice', 'cost', 'pricewholesale'],
	retail_price: ['retail', 'retailprice', 'msrp', 'srp', 'priceretail'],
	category: ['category', 'cat', 'department', 'dept'],
	subcategory: ['subcategory', 'subcat', 'sub'],
	description: ['description', 'desc', 'details'],
	sizes: ['size', 'sizes', 'sizerun', 'availablesizes'],
	colors: ['color', 'colors', 'colorways', 'colorway', 'colour', 'colours'],
	season: ['season'],
	product_year: ['year', 'productyear', 'seasonyear'],
	image_url: ['image', 'imageurl', 'photo', 'photourl', 'picture', 'imagelink', 'img']
};

function normalize(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Field keys ordered so first-match wins on ambiguous inputs. Most-specific
// → least-specific (e.g. "subcategory" before "category" so "subcat" doesn't
// substring-hit "category").
const FIELD_ORDER: ProductFieldKey[] = [
	'subcategory',
	'category',
	'wholesale_price',
	'retail_price',
	'style_number',
	'product_year',
	'season',
	'image_url',
	'description',
	'sizes',
	'colors',
	'name'
];

export function suggestColumnMapping(header: string): ProductFieldKey | null {
	const norm = normalize(header);
	if (!norm) return null;

	// Exact match first across all fields.
	for (const field of FIELD_ORDER) {
		if (SUGGESTIONS[field].includes(norm)) return field;
	}

	// Substring match in field order. The order matters — `subcategory`
	// must beat `category` when the header is "subcategory", and
	// `wholesale_price` must beat `wholesale` standalone before falling
	// to bare price.
	for (const field of FIELD_ORDER) {
		for (const synonym of SUGGESTIONS[field]) {
			if (norm.includes(synonym) || synonym.includes(norm)) return field;
		}
	}

	return null;
}

// Required fields — the mapping UI's "Continue" button stays disabled
// until each of these is mapped to some uploaded column.
export const REQUIRED_PRODUCT_FIELDS: ProductFieldKey[] = [
	'name',
	'style_number',
	'wholesale_price'
];

// Human-readable labels for the "Map to" dropdown.
export const PRODUCT_FIELD_LABELS: Record<ProductFieldKey, string> = {
	name: 'Name',
	style_number: 'Style number',
	wholesale_price: 'Wholesale price',
	retail_price: 'Retail price',
	category: 'Category',
	subcategory: 'Subcategory',
	description: 'Description',
	sizes: 'Sizes',
	colors: 'Colors',
	season: 'Season',
	product_year: 'Product year',
	image_url: 'Image URL'
};

// ─── Whole-file header mapping ────────────────────────────────────────────
//
// `suggestColumnMapping` above answers "what could THIS header be?" one header
// at a time. That is right for the mapping UI, where the user sees every guess
// and can override it. It is NOT enough for an automatic import: it is greedy
// per-header, so on a wide export the first header that loosely matches claims
// a field and the correct column further right never gets a turn.
//
// A real JOOR line sheet (92 columns) broke every field that way:
//   style_number -> "Collection Styles Comment"  (substring "style")
//   name         -> "Linesheet Name"             (substring "name")
//   price        -> "Wholesale Currency_1"       (substring "wholesale")
//
// `mapProductHeaders` fixes this by scoring EVERY (header, field) pair and
// assigning globally best-first, so "Style Number" takes style_number before
// "Collection Styles Comment" can, and "Style Name" then falls to name.
//
// Scoring is token-based rather than substring-based: "Fabrication ID" no
// longer matches category just because "fabri(cat)ion" contains "cat".
//
// Header text alone still can't separate "Wholesale Price_1" (154.00) from
// "Wholesale Currency_1" (USD), or "Size Name" (M) from "Sizes Run" (always
// "1"). So candidates are also validated against sample rows.

/** Tokens that appear in export column names but carry no field meaning. */
const NOISE_TOKENS = new Set([
	'id',
	'code',
	'order',
	'active',
	'comment',
	'currency',
	'type',
	'label',
	'filename',
	'minimum',
	'min',
	// Cost-adjacent columns that are not the product's own price.
	'shipping',
	'freight',
	'tax',
	'discount'
]);

function tokenize(header: string): string[] {
	return header
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase -> camel Case
		.replace(/([a-zA-Z])(\d)/g, '$1 $2') // "Category1" -> "Category 1"
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 0 && !/^\d+$/.test(t));
}

function singular(token: string): string {
	return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

/**
 * How well `header` names `field`, as a 0–1 share of the header's meaningful
 * tokens that the best-matching synonym accounts for. 0 means no match.
 *
 * "Wholesale Price_1" -> [wholesale, price], synonym "wholesaleprice" covers
 * both -> 1.0. "Wholesale Currency_1" -> [wholesale, currency], synonym
 * "wholesale" covers one of two -> 0.5. The price column wins.
 */
export function scoreHeaderForField(header: string, field: ProductFieldKey): number {
	const tokens = tokenize(header);
	if (tokens.length === 0) return 0;
	const stems = tokens.map(singular);

	let best = 0;
	for (const synonym of SUGGESTIONS[field]) {
		const synStem = singular(synonym);
		// Match the synonym against every contiguous run of tokens, so a
		// multi-word synonym ("wholesaleprice") can span two columns' worth
		// of tokens without matching across unrelated ones.
		for (let i = 0; i < tokens.length; i++) {
			for (let j = i + 1; j <= tokens.length; j++) {
				const raw = tokens.slice(i, j).join('');
				const stemmed = stems.slice(i, j).join('');
				if (raw === synonym || stemmed === synStem) {
					best = Math.max(best, (j - i) / tokens.length);
				}
			}
		}
	}
	if (best === 0) return 0;

	const noise = tokens.filter((t) => NOISE_TOKENS.has(t)).length;
	return best - noise * 0.2;
}

/**
 * Below this, a match is too weak to auto-assign. Without a floor, any partial
 * synonym hit becomes a candidate: a sheet with no recognizable price column
 * but a "Shipping Cost" column would silently import shipping as wholesale.
 * Failing to map is recoverable — the import reports it. A wrong mapping is
 * not: it writes plausible garbage.
 *
 * Calibrated to keep the real two-token headers ("Size Name", "Color Name",
 * "Season Name" all score 0.5) while rejecting noise-penalised ones.
 */
const MIN_ASSIGN_SCORE = 0.4;

/**
 * True when the whole header IS the field's canonical name ("sizes", "color"),
 * as opposed to merely containing a synonym.
 *
 * Only these skip the value checks. A full-coverage score is not enough on its
 * own: JOOR's "Sizes Run" scores 1.0 against the `sizerun` synonym, and it is
 * exactly the column the constant-value check exists to reject. The first entry
 * in each SUGGESTIONS list is the canonical name.
 */
function isCanonicalHeader(header: string, field: ProductFieldKey): boolean {
	const joined = tokenize(header).map(singular).join('');
	return joined.length > 0 && joined === singular(SUGGESTIONS[field][0]);
}

/** Rows scanned when validating a candidate column against its values. */
const VALUE_SAMPLE_SIZE = 100;

const isNumeric = (v: string) => Number.isFinite(Number(v.replace(/[$,\s]/g, '')));

/**
 * Reject a header whose VALUES contradict the field its name suggests. Header
 * text cannot distinguish a price column from its currency column.
 */
function valuesFitField(field: ProductFieldKey, values: string[]): boolean {
	const filled = values.map((v) => (v ?? '').trim()).filter((v) => v.length > 0);
	if (filled.length === 0) return true; // nothing to judge on; let the name decide

	switch (field) {
		case 'wholesale_price':
		case 'retail_price':
			// "USD" is not a price.
			return filled.filter(isNumeric).length / filled.length >= 0.5;
		case 'product_year': {
			const years = filled.filter((v) => {
				const n = Number(v);
				return Number.isInteger(n) && n >= 1900 && n <= 2200;
			});
			// Kills "Season Year ID" (307824) while keeping "Season Year" (2026).
			return years.length / filled.length >= 0.5;
		}
		case 'image_url':
			// Kills "Style Image Filename_1" in favour of "Style Image URL_1".
			return filled.filter((v) => /^https?:\/\//i.test(v)).length / filled.length >= 0.5;
		case 'sizes':
		case 'colors':
			// A column whose every value is identical carries no per-row
			// information. Kills JOOR's "Sizes Run", which is always "1",
			// in favour of "Size Name".
			//
			// This is a TIE-BREAKER for ambiguous headers only. A header that
			// IS the canonical field name skips it (see `isCanonicalHeader` at
			// the call site): our own CSV template ships a constant
			// "XS, S, M, L, XL" size column, and a brand with one size run
			// across its catalogue is ordinary, not suspicious.
			return filled.length < 2 || new Set(filled).size > 1;
		default:
			return true;
	}
}

/**
 * Assign at most one header to each product field, best match first.
 *
 * `sampleRows` are keyed by lowercased header (the shape `parseCSV` produces).
 * Pass them whenever available — without them only header text is considered
 * and currency/price style collisions cannot be resolved.
 */
export function mapProductHeaders(
	headers: string[],
	sampleRows: Record<string, string>[] = []
): Map<ProductFieldKey, string> {
	type Candidate = { header: string; field: ProductFieldKey; score: number; index: number };
	const candidates: Candidate[] = [];

	// Cap the scan: a 50k-row export would otherwise allocate one full-length
	// array per header per field on the main thread. A hundred rows is plenty
	// to tell a price column from a currency column.
	const sample = sampleRows.slice(0, VALUE_SAMPLE_SIZE);

	headers.forEach((header, index) => {
		const key = header.trim().toLowerCase();
		const values = sample.map((r) => r[key] ?? '');
		for (const field of FIELD_ORDER) {
			const score = scoreHeaderForField(header, field);
			if (score < MIN_ASSIGN_SCORE) continue;
			// Value checks disambiguate competing headers; they must not
			// overrule a header that already names the field outright.
			if (!isCanonicalHeader(header, field) && !valuesFitField(field, values)) continue;
			candidates.push({ header, field, score, index });
		}
	});

	candidates.sort(
		(a, b) =>
			b.score - a.score ||
			FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field) ||
			a.index - b.index
	);

	const byField = new Map<ProductFieldKey, string>();
	const takenHeaders = new Set<string>();
	for (const c of candidates) {
		// Key on the normalized name, which is what rows are actually keyed by.
		// "Size" and "size " are one column at read time, so two fields must
		// not each claim one of them and then read identical values.
		const key = c.header.trim().toLowerCase();
		if (byField.has(c.field) || takenHeaders.has(key)) continue;
		byField.set(c.field, key);
		takenHeaders.add(key);
	}
	return byField;
}
