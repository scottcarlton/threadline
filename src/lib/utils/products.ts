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
	if (statuses.includes('out')) return 'out';
	if (statuses.includes('low')) return 'low';
	return 'in';
}
