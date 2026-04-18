export type ProductVariant = {
	id: string;
	color: string | null;
	size: string | null;
	price_override: number | null;
};

export type ProductImage = {
	id: string;
	is_primary: boolean;
	sort_order: number | null;
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
