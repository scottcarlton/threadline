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
	name: ['name', 'productname', 'producttitle', 'item', 'itemname', 'title'],
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
