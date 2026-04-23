export type StockStatus = 'in' | 'low' | 'out';

export function deriveStockStatus(
	qty: number | null,
	threshold: number | null
): StockStatus | null {
	if (qty === null) return null;
	if (qty <= 0) return 'out';
	if (threshold !== null && qty <= threshold) return 'low';
	return 'in';
}
