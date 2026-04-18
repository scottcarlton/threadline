import type { SupabaseClient } from '@supabase/supabase-js';

export type RepAgencyInput = {
	repOrgId: string;
	repOrgName: string;
	orders: Array<{ total_amount: number | string; created_at: string }>;
};

export type RepAgencyRow = {
	repOrgId: string;
	repOrgName: string;
	orders: number;
	revenue: number;
	avgOrderValue: number;
	lastOrderDate: string | null;
	status: 'active' | 'inactive';
};

export function computeRepAgencyRow(input: RepAgencyInput): RepAgencyRow {
	const count = input.orders.length;
	const revenue = input.orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
	const lastOrderDate = count
		? input.orders
				.map((o) => o.created_at)
				.sort()
				.slice(-1)[0]
		: null;
	return {
		repOrgId: input.repOrgId,
		repOrgName: input.repOrgName,
		orders: count,
		revenue,
		avgOrderValue: count ? revenue / count : 0,
		lastOrderDate,
		status: count ? 'active' : 'inactive'
	};
}

type ConnectionRow = {
	rep_org_id: string;
	organizations: { name?: string } | { name?: string }[] | null;
};

type FederatedOrderRow = {
	source_org_id: string;
	orders:
		| { total_amount: number | string; created_at: string }
		| { total_amount: number | string; created_at: string }[]
		| null;
};

/**
 * Brand-side query. Federation view — must NOT filter orders by organization_id.
 * Relies on the RLS policy added in migration 20260418000003 (brand can SELECT
 * connected rep organizations) and the existing federated_order_links join.
 */
export async function loadSalesByRepAgency(
	supabase: SupabaseClient,
	brandOrgId: string,
	year: number
): Promise<RepAgencyRow[]> {
	const [connectionsRes, linksRes] = await Promise.all([
		supabase
			.from('org_connections')
			.select('rep_org_id, organizations:rep_org_id(name)')
			.eq('brand_org_id', brandOrgId)
			.eq('status', 'active'),
		supabase
			.from('federated_order_links')
			.select('source_org_id, orders!inner(total_amount, created_at, order_year, status)')
			.eq('target_org_id', brandOrgId)
			.eq('status', 'active')
			.eq('orders.order_year', year)
			.neq('orders.status', 'cancelled')
	]);

	const connections = ((connectionsRes.data ?? []) as ConnectionRow[]).map((c) => ({
		rep_org_id: c.rep_org_id,
		name:
			(Array.isArray(c.organizations) ? c.organizations[0]?.name : c.organizations?.name) ??
			'Unknown'
	}));

	const ordersByRep = new Map<
		string,
		Array<{ total_amount: number | string; created_at: string }>
	>();
	for (const link of (linksRes.data ?? []) as FederatedOrderRow[]) {
		const order = Array.isArray(link.orders) ? link.orders[0] : link.orders;
		if (!order) continue;
		const list = ordersByRep.get(link.source_org_id) ?? [];
		list.push({ total_amount: order.total_amount, created_at: order.created_at });
		ordersByRep.set(link.source_org_id, list);
	}

	return connections
		.map((conn) =>
			computeRepAgencyRow({
				repOrgId: conn.rep_org_id,
				repOrgName: conn.name,
				orders: ordersByRep.get(conn.rep_org_id) ?? []
			})
		)
		.sort((a, b) => b.revenue - a.revenue);
}
