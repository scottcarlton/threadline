export interface ProductAttribute {
	value: string;
	label: string;
	category: string;
}

export const PRODUCT_ATTRIBUTES: ProductAttribute[] = [
	// Sustainability
	{ value: 'recycled_materials', label: 'Recycled Materials', category: 'Sustainability' },
	{ value: 'organic_materials', label: 'Organic Materials', category: 'Sustainability' },
	{ value: 'ethically_sourced', label: 'Ethically Sourced', category: 'Sustainability' },
	{ value: 'fair_trade', label: 'Fair Trade Certified', category: 'Sustainability' },
	{ value: 'vegan', label: 'Vegan / Cruelty-Free', category: 'Sustainability' },

	// Production
	{ value: 'handmade', label: 'Handmade / Artisan', category: 'Production' },
	{ value: 'made_in_usa', label: 'Made in USA', category: 'Production' },
	{ value: 'small_batch', label: 'Small Batch', category: 'Production' },
	{ value: 'limited_edition', label: 'Limited Edition', category: 'Production' },

	// Material
	{ value: 'natural_fibers', label: 'Natural Fibers', category: 'Material' },
	{ value: 'performance_fabric', label: 'Performance Fabric', category: 'Material' },
	{ value: 'deadstock_fabric', label: 'Deadstock Fabric', category: 'Material' }
];

const labelMap = new Map(PRODUCT_ATTRIBUTES.map((a) => [a.value, a.label]));

export function getAttributeLabel(value: string): string {
	return labelMap.get(value) ?? value;
}

export function getAttributesByCategory(): Record<string, ProductAttribute[]> {
	const grouped: Record<string, ProductAttribute[]> = {};
	for (const attr of PRODUCT_ATTRIBUTES) {
		(grouped[attr.category] ??= []).push(attr);
	}
	return grouped;
}
