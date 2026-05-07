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
	size_qtys: Record<string, number>;
};

export function primaryImageId(p: CatalogProduct): string | null {
	const primary = p.product_images?.find((i) => i.is_primary);
	return primary?.id ?? p.product_images?.[0]?.id ?? null;
}

export function productColors(p: CatalogProduct): string[] {
	return [...new Set(p.product_variants.map((v) => v.color).filter(Boolean) as string[])];
}

export function productSizes(p: CatalogProduct): string[] {
	return [...new Set(p.product_variants.map((v) => v.size).filter(Boolean) as string[])];
}

export function itemUnits(it: CatalogCartItem): number {
	return Object.values(it.size_qtys).reduce((s, q) => s + (q || 0), 0);
}

export function itemTotal(it: CatalogCartItem): number {
	return itemUnits(it) * it.unit_price;
}

export function itemIsSized(it: CatalogCartItem): boolean {
	return itemUnits(it) > 0;
}

export function catalogProductToCartItem(p: CatalogProduct): CatalogCartItem {
	const colors = productColors(p);
	const sizes = productSizes(p);
	const size_qtys: Record<string, number> = {};
	for (const s of sizes) size_qtys[s] = 0;
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
		size_qtys
	};
}
