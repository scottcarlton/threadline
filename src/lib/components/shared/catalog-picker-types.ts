export type ProductVariant = {
	id: string;
	color: string | null;
	color_hex: string | null;
	size: string | null;
	price_override: number | null;
	stock_qty: number | null;
	stock_threshold: number | null;
	shopify_variant_id: string | null;
};

export type ProductImage = {
	id: string;
	is_primary: boolean;
	sort_order: number | null;
	role?: 'primary' | 'hover' | null;
	variant_id?: string | null;
};

export type CatalogProduct = {
	id: string;
	brand_id: string;
	season_id: string | null;
	product_year: number | null;
	style_number: string;
	name: string;
	wholesale_price: number;
	category: string | null;
	ats: boolean;
	product_variants: ProductVariant[];
	product_images: ProductImage[];
};

/** color → size → qty */
export type ColorSizeQtys = Record<string, Record<string, number>>;

export type CatalogCartItem = {
	product_id: string;
	brand_id: string;
	season_id: string | null;
	original_season_id: string | null;
	product_year: number | null;
	style_number: string;
	name: string;
	unit_price: number;
	image_id: string | null;
	available_colors: string[];
	available_sizes: string[];
	selected_color: string;
	/** Legacy single-color qty map — used by /orders/new and /products/order */
	size_qtys: Record<string, number>;
	/** Per-color qty map — used by catalog picker modal on /orders/[id] */
	color_size_qtys: ColorSizeQtys;
	/** color → primary image_id */
	color_image_ids: Record<string, string>;
};

export function primaryImageId(p: CatalogProduct): string | null {
	const primary = p.product_images?.find((i) => i.is_primary);
	return primary?.id ?? p.product_images?.[0]?.id ?? null;
}

export function colorPrimaryImageId(p: CatalogProduct, color: string): string | null {
	const variantIds = new Set(p.product_variants.filter((v) => v.color === color).map((v) => v.id));
	const imgs = (p.product_images ?? []).filter((i) => i.variant_id && variantIds.has(i.variant_id));
	return imgs.find((i) => i.role === 'primary')?.id ?? imgs[0]?.id ?? null;
}

export function productColors(p: CatalogProduct): string[] {
	return [...new Set(p.product_variants.map((v) => v.color).filter(Boolean) as string[])];
}

const SIZE_ORDER: Record<string, number> = {
	XXXS: 0,
	XXS: 1,
	XS: 2,
	S: 3,
	M: 4,
	L: 5,
	XL: 6,
	XXL: 7,
	XXXL: 8,
	'2XL': 7,
	'3XL': 8,
	'4XL': 9,
	OS: 50,
	'One Size': 50,
	OSFA: 50
};

function sizeRank(s: string): number {
	const upper = s.toUpperCase();
	if (upper in SIZE_ORDER) return SIZE_ORDER[upper];
	const n = parseFloat(s);
	if (!Number.isNaN(n)) return 100 + n;
	return 200;
}

export function productSizes(p: CatalogProduct): string[] {
	const raw = [...new Set(p.product_variants.map((v) => v.size).filter(Boolean) as string[])];
	return raw.sort((a, b) => sizeRank(a) - sizeRank(b));
}

export function itemUnits(it: CatalogCartItem): number {
	let total = 0;
	for (const sizeMap of Object.values(it.color_size_qtys)) {
		for (const q of Object.values(sizeMap)) total += q || 0;
	}
	return total;
}

export function itemColorCount(it: CatalogCartItem): number {
	let count = 0;
	for (const sizeMap of Object.values(it.color_size_qtys)) {
		const units = Object.values(sizeMap).reduce((s, q) => s + (q || 0), 0);
		if (units > 0) count++;
	}
	return count;
}

export function itemTotal(it: CatalogCartItem): number {
	return itemUnits(it) * it.unit_price;
}

export function itemIsSized(it: CatalogCartItem): boolean {
	return itemUnits(it) > 0;
}

export function colorQtys(it: CatalogCartItem, color: string): Record<string, number> {
	return it.color_size_qtys[color] ?? {};
}

export function colorUnits(it: CatalogCartItem, color: string): number {
	const sq = it.color_size_qtys[color];
	if (!sq) return 0;
	return Object.values(sq).reduce((s, q) => s + (q || 0), 0);
}

export function catalogProductToCartItem(p: CatalogProduct): CatalogCartItem {
	const colors = productColors(p);
	const sizes = productSizes(p);
	const size_qtys: Record<string, number> = {};
	for (const s of sizes) size_qtys[s] = 0;
	const color_size_qtys: ColorSizeQtys = {};
	for (const c of colors) {
		color_size_qtys[c] = {};
		for (const s of sizes) color_size_qtys[c][s] = 0;
	}
	if (colors.length === 0) {
		color_size_qtys[''] = {};
		for (const s of sizes) color_size_qtys[''][s] = 0;
	}
	const color_image_ids: Record<string, string> = {};
	for (const c of colors) {
		const imgId = colorPrimaryImageId(p, c);
		if (imgId) color_image_ids[c] = imgId;
	}
	return {
		product_id: p.id,
		brand_id: p.brand_id,
		season_id: p.season_id,
		original_season_id: p.season_id,
		product_year: p.product_year,
		style_number: p.style_number,
		name: p.name,
		unit_price: p.wholesale_price,
		image_id: primaryImageId(p),
		available_colors: colors,
		available_sizes: sizes,
		selected_color: colors[0] ?? '',
		size_qtys,
		color_size_qtys,
		color_image_ids
	};
}
