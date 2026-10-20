type StockLine = {
	product_id: string | null;
	color: string | null;
	size: string | null;
	qty: number;
};
type StockProduct = {
	id: string;
	ats: boolean;
	product_variants: { color: string | null; size: string | null; stock_qty: number | null }[];
};

/**
 * Lines whose qty exceeds the matched variant's stock_qty. Only ATS products
 * are checked (prebook doesn't draw on current stock), and lines with no
 * matching variant or untracked stock are skipped.
 */
export function overStockLines<L extends StockLine>(lines: L[], products: StockProduct[]): L[] {
	const byId = new Map(products.map((p) => [p.id, p]));
	return lines.filter((line) => {
		const product = line.product_id ? byId.get(line.product_id) : undefined;
		if (!product?.ats) return false;
		const variant = product.product_variants.find(
			(v) => (v.color ?? null) === (line.color ?? null) && (v.size ?? null) === (line.size ?? null)
		);
		if (!variant || variant.stock_qty === null) return false;
		return line.qty > variant.stock_qty;
	});
}
