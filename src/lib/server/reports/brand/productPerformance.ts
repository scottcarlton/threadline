import type { SupabaseClient } from '@supabase/supabase-js';

export type VelocityRow = {
	style_number: string;
	product_name: string;
	brand_name: string;
	account_count: number;
	order_count: number;
	total_qty: number;
	total_revenue: number;
	avg_qty_per_account: number;
};

export type ProductPerformanceRow = {
	styleNumber: string;
	productName: string;
	unitsOrdered: number;
	revenue: number;
	accounts: number;
	velocityScore: number;
	trend: 'up' | 'down' | 'flat';
};

export function classifyTrend(current: number, prior: number): 'up' | 'down' | 'flat' {
	if (current === 0 && prior === 0) return 'flat';
	if (prior === 0) return current > 0 ? 'up' : 'flat';
	const ratio = (current - prior) / prior;
	if (ratio >= 0.1) return 'up';
	if (ratio <= -0.1) return 'down';
	return 'flat';
}

export function buildProductPerformanceRows(
	current: VelocityRow[],
	prior: VelocityRow[]
): ProductPerformanceRow[] {
	const priorByStyle = new Map(prior.map((r) => [r.style_number, r]));
	const currentByStyle = new Map(current.map((r) => [r.style_number, r]));

	const allStyles = new Set<string>([...currentByStyle.keys(), ...priorByStyle.keys()]);

	return Array.from(allStyles)
		.map((style) => {
			const c = currentByStyle.get(style);
			const p = priorByStyle.get(style);
			const anchor = c ?? p!;
			const unitsCurrent = c?.total_qty ?? 0;
			const unitsPrior = p?.total_qty ?? 0;
			return {
				styleNumber: anchor.style_number,
				productName: anchor.product_name,
				unitsOrdered: unitsCurrent,
				revenue: c?.total_revenue ?? 0,
				accounts: c?.account_count ?? 0,
				velocityScore: (c?.account_count ?? 0) * (c?.avg_qty_per_account ?? 0),
				trend: classifyTrend(unitsCurrent, unitsPrior)
			};
		})
		.sort((a, b) => b.velocityScore - a.velocityScore);
}

/**
 * Loads product performance data for a brand across connected reps.
 * Calls get_style_velocity_for_brand twice: once for the current window,
 * once for a double-length window. The prior-window subset is the double
 * minus the current, per style.
 *
 * Accepts `string | string[]` for `brandOrgId`. For Nx-BLSR (sales role
 * across multiple brand-orgs), we union the velocity rows from each org
 * before computing trends. Style numbers are unique within a brand org;
 * across orgs, identical style numbers get summed (rare but defensible).
 */
export async function loadProductPerformance(
	supabase: SupabaseClient,
	brandOrgIdInput: string | string[],
	daysBack: number
): Promise<ProductPerformanceRow[]> {
	const ids = Array.isArray(brandOrgIdInput) ? brandOrgIdInput : [brandOrgIdInput];

	async function fetchVelocity(window: number) {
		const batches = await Promise.all(
			ids.map((id) =>
				supabase.rpc('get_style_velocity_for_brand', {
					brand_org_id: id,
					days_back: window,
					min_accounts: 1
				})
			)
		);
		return batches.flatMap((b) => (b.data ?? []) as VelocityRow[]);
	}

	const [currentAll, doubleAll] = await Promise.all([
		fetchVelocity(daysBack),
		fetchVelocity(daysBack * 2)
	]);

	const currentByStyle = new Map(currentAll.map((r) => [r.style_number, r]));
	const priorByStyle = new Map<string, VelocityRow>();

	for (const r of doubleAll) {
		const c = currentByStyle.get(r.style_number);
		if (c) {
			priorByStyle.set(r.style_number, {
				...r,
				account_count: Math.max(0, r.account_count - c.account_count),
				order_count: Math.max(0, r.order_count - c.order_count),
				total_qty: Math.max(0, r.total_qty - c.total_qty),
				total_revenue: Math.max(0, r.total_revenue - c.total_revenue)
			});
		} else {
			priorByStyle.set(r.style_number, r);
		}
	}

	return buildProductPerformanceRows(currentAll, Array.from(priorByStyle.values()));
}
