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
 *
 * Accepts `string | string[]` for `brandOrgId`. For Nx-BLSR (multiple
 * brand-org memberships) we call the RPC per-org and merge by status —
 * counts and totals are summed so each status appears once.
 */
export async function loadOrderPipeline(
	supabase: SupabaseClient,
	brandOrgIdInput: string | string[]
): Promise<OrderPipelineRow[]> {
	const ids = Array.isArray(brandOrgIdInput) ? brandOrgIdInput : [brandOrgIdInput];
	const batches = await Promise.all(
		ids.map((id) => supabase.rpc('get_brand_order_pipeline', { brand_org_id: id }))
	);
	const firstError = batches.find((b) => b.error)?.error;
	if (firstError) throw firstError;
	const merged = new Map<string, OrderPipelineRow>();
	for (const batch of batches) {
		for (const raw of (batch.data ?? []) as RawRow[]) {
			const row = mapOrderPipelineRow(raw);
			const existing = merged.get(row.status);
			if (existing) {
				existing.count += row.count;
				existing.total_amount += row.total_amount;
			} else {
				merged.set(row.status, row);
			}
		}
	}
	return [...merged.values()];
}
