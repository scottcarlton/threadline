import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderPipelineRow = {
	status: string;
	count: number;
	total_amount: number;
};

type RawRow = {
	status: string;
	count: number | string;
	total_amount: number | string;
};

export function mapOrderPipelineRow(raw: RawRow): OrderPipelineRow {
	return {
		status: raw.status,
		count: Number(raw.count),
		total_amount: Number(raw.total_amount)
	};
}

/**
 * Brand-side Order Pipeline — one row per non-cancelled order status
 * across BOLSR + MBISR orders (via get_brand_order_ids). Current-state
 * view, not year-scoped; includes orders from any year that are still
 * in a non-terminal workflow.
 */
export async function loadOrderPipeline(
	supabase: SupabaseClient,
	brandOrgId: string
): Promise<OrderPipelineRow[]> {
	const { data, error } = await supabase.rpc('get_brand_order_pipeline', {
		brand_org_id: brandOrgId
	});
	if (error) throw error;
	return ((data ?? []) as RawRow[]).map(mapOrderPipelineRow);
}
