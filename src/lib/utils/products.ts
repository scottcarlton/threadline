import { deriveStockStatus, type StockStatus } from '$lib/inventory/status';

export function getVariantSummary(
	variants: { color: string | null; size: string | null }[]
): string {
	const colors = new Set(variants.map((v) => v.color).filter(Boolean));
	const sizes = new Set(variants.map((v) => v.size).filter(Boolean));
	const parts: string[] = [];
	if (colors.size > 0) parts.push(`${colors.size} color${colors.size > 1 ? 's' : ''}`);
	if (sizes.size > 0) parts.push(`${sizes.size} size${sizes.size > 1 ? 's' : ''}`);
	return parts.join(', ') || 'No variants';
}

export function aggregateStockStatus(
	variants: { stock_qty: number | null; stock_threshold: number | null }[]
): StockStatus | null {
	const statuses = variants
		.map((v) => deriveStockStatus(v.stock_qty, v.stock_threshold))
		.filter((s): s is StockStatus => s !== null);
	if (statuses.length === 0) return null;
	// Product-level: out only when every tracked variant is out. A partly
	// sold-through style is still orderable, so it reads as low.
	if (statuses.every((s) => s === 'out')) return 'out';
	if (statuses.some((s) => s !== 'in')) return 'low';
	return 'in';
}

/** An ATS variant with tracked stock at or below zero can't be ordered. */
export function isVariantSoldOut(ats: boolean, variant: { stock_qty: number | null }): boolean {
	return ats && variant.stock_qty !== null && variant.stock_qty <= 0;
}
