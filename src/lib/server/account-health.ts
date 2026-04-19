import type { SupabaseClient } from '@supabase/supabase-js';

export type AccountHealth = {
	accountId: string;
	score: number; // 0-100
	label: 'excellent' | 'good' | 'fair' | 'at_risk' | 'inactive' | 'new';
	signals: string[];
	lastOrderDate: string | null;
	daysSinceLastOrder: number | null;
	totalOrders: number;
	ytdOrders: number;
	lifetimeRevenue: number;
	ytdRevenue: number;
	avgOrderValue: number;
	yoyGrowth: number | null; // percentage
};

export async function computeAccountHealth(
	supabase: SupabaseClient,
	organizationId: string | string[]
): Promise<Map<string, AccountHealth>> {
	const orgIds = Array.isArray(organizationId) ? organizationId : [organizationId];
	if (orgIds.length === 0) return new Map();

	const currentYear = new Date().getFullYear();
	const priorYear = currentYear - 1;
	const now = new Date();

	const ordersQuery = supabase
		.from('orders')
		.select('account_id, total_amount, status, created_at, order_year')
		.neq('status', 'cancelled');
	const accountsQuery = supabase.from('accounts').select('id, created_at, is_active, archived_at');

	// Use .eq for a single org (test mocks don't implement .in); .in for multiple.
	const [{ data: directOrders }, { data: accounts }] =
		orgIds.length === 1
			? await Promise.all([
					ordersQuery.eq('organization_id', orgIds[0]),
					accountsQuery.eq('organization_id', orgIds[0])
				])
			: await Promise.all([
					ordersQuery.in('organization_id', orgIds),
					accountsQuery.in('organization_id', orgIds)
				]);

	// Also include orders federated INTO these orgs (rep → brand). A brand
	// org's account health must reflect orders the rep created that reference
	// this brand's accounts, not just orders owned by the brand org directly.
	type LinkRow = { order_id: string | null };
	const linksRes = (await (orgIds.length === 1
		? supabase
				.from('federated_order_links')
				.select('order_id')
				.eq('status', 'active')
				.eq('target_org_id', orgIds[0])
		: supabase
				.from('federated_order_links')
				.select('order_id')
				.eq('status', 'active')
				.in('target_org_id', orgIds))) as { data: LinkRow[] | null };
	const federatedIds = (linksRes.data ?? [])
		.map((l) => l.order_id)
		.filter((id): id is string => !!id);
	let federatedOrders: typeof directOrders = [];
	if (federatedIds.length > 0) {
		const { data } = await supabase
			.from('orders')
			.select('account_id, total_amount, status, created_at, order_year')
			.neq('status', 'cancelled')
			.in('id', federatedIds);
		federatedOrders = data ?? [];
	}
	const orders = [...(directOrders ?? []), ...(federatedOrders ?? [])];

	const healthMap = new Map<string, AccountHealth>();

	// Build per-account metrics
	const accountMetrics = new Map<
		string,
		{
			orders: Array<{
				total_amount: number;
				created_at: string;
				order_year: number | null;
				status: string;
			}>;
			createdAt: string;
			isActive: boolean;
			archivedAt: string | null;
		}
	>();

	for (const acct of accounts ?? []) {
		accountMetrics.set(acct.id, {
			orders: [],
			createdAt: acct.created_at,
			isActive: acct.is_active,
			archivedAt: acct.archived_at
		});
	}

	for (const order of orders ?? []) {
		const m = accountMetrics.get(order.account_id);
		if (m) {
			m.orders.push({
				total_amount: Number(order.total_amount),
				created_at: order.created_at,
				order_year: order.order_year,
				status: order.status
			});
		}
	}

	for (const [accountId, metrics] of accountMetrics) {
		const { orders: acctOrders, createdAt, archivedAt } = metrics;

		// Skip archived
		if (archivedAt) continue;

		const totalOrders = acctOrders.length;
		const lifetimeRevenue = acctOrders.reduce((sum, o) => sum + o.total_amount, 0);
		const ytdOrders = acctOrders.filter((o) => o.order_year === currentYear).length;
		const ytdRevenue = acctOrders
			.filter((o) => o.order_year === currentYear)
			.reduce((sum, o) => sum + o.total_amount, 0);
		const priorYearRevenue = acctOrders
			.filter((o) => o.order_year === priorYear)
			.reduce((sum, o) => sum + o.total_amount, 0);
		const avgOrderValue = totalOrders > 0 ? lifetimeRevenue / totalOrders : 0;

		// Recency
		const orderDates = acctOrders.map((o) => new Date(o.created_at).getTime());
		const lastOrderTime = orderDates.length > 0 ? Math.max(...orderDates) : null;
		const lastOrderDate = lastOrderTime ? new Date(lastOrderTime).toISOString() : null;
		const daysSinceLastOrder = lastOrderTime
			? Math.floor((now.getTime() - lastOrderTime) / (1000 * 60 * 60 * 24))
			: null;

		// YoY growth
		const yoyGrowth =
			priorYearRevenue > 0 ? ((ytdRevenue - priorYearRevenue) / priorYearRevenue) * 100 : null;

		// Account age in days
		const accountAgeDays = Math.floor(
			(now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
		);

		// Score calculation (0-100)
		let score = 0;
		const signals: string[] = [];

		// New account (< 90 days, no orders)
		if (accountAgeDays <= 90 && totalOrders === 0) {
			healthMap.set(accountId, {
				accountId,
				score: 0,
				label: 'new',
				signals: [],
				lastOrderDate,
				daysSinceLastOrder,
				totalOrders,
				ytdOrders,
				lifetimeRevenue,
				ytdRevenue,
				avgOrderValue,
				yoyGrowth
			});
			continue;
		}

		// Inactive (no orders ever, older than 90 days)
		if (totalOrders === 0) {
			healthMap.set(accountId, {
				accountId,
				score: 10,
				label: 'inactive',
				signals: ['No orders placed'],
				lastOrderDate,
				daysSinceLastOrder,
				totalOrders,
				ytdOrders,
				lifetimeRevenue,
				ytdRevenue,
				avgOrderValue,
				yoyGrowth
			});
			continue;
		}

		// Recency score (0-30 points)
		if (daysSinceLastOrder !== null) {
			if (daysSinceLastOrder <= 30) {
				score += 30;
			} else if (daysSinceLastOrder <= 60) {
				score += 25;
			} else if (daysSinceLastOrder <= 90) {
				score += 20;
			} else if (daysSinceLastOrder <= 180) {
				score += 10;
				signals.push(`Last order ${daysSinceLastOrder} days ago`);
			} else {
				score += 5;
				signals.push(`No orders in ${daysSinceLastOrder} days`);
			}
		}

		// Frequency score (0-25 points)
		if (ytdOrders >= 5) {
			score += 25;
		} else if (ytdOrders >= 3) {
			score += 20;
		} else if (ytdOrders >= 1) {
			score += 15;
		} else if (totalOrders >= 3) {
			score += 5;
			signals.push('No orders this year');
		} else {
			signals.push('No orders this year');
		}

		// Monetary score (0-25 points)
		if (ytdRevenue >= 50000) {
			score += 25;
		} else if (ytdRevenue >= 20000) {
			score += 20;
		} else if (ytdRevenue >= 5000) {
			score += 15;
		} else if (ytdRevenue >= 1000) {
			score += 10;
		} else if (ytdRevenue > 0) {
			score += 5;
		}

		// Growth score (0-20 points)
		if (yoyGrowth !== null) {
			if (yoyGrowth >= 20) {
				score += 20;
				signals.push(`Growing ${Math.round(yoyGrowth)}% YoY`);
			} else if (yoyGrowth >= 0) {
				score += 15;
			} else if (yoyGrowth >= -20) {
				score += 10;
				signals.push(`Down ${Math.abs(Math.round(yoyGrowth))}% YoY`);
			} else {
				score += 5;
				signals.push(`Declining ${Math.abs(Math.round(yoyGrowth))}% YoY`);
			}
		} else if (ytdOrders > 0) {
			score += 15; // New customer this year, no prior data
		}

		// At risk signals
		if (priorYearRevenue > 0 && ytdOrders === 0) {
			signals.push('Ordered last year but not this year');
			score = Math.min(score, 35);
		}

		// Label
		let label: AccountHealth['label'];
		if (score >= 80) label = 'excellent';
		else if (score >= 60) label = 'good';
		else if (score >= 40) label = 'fair';
		else if (score >= 20) label = 'at_risk';
		else label = 'inactive';

		healthMap.set(accountId, {
			accountId,
			score,
			label,
			signals,
			lastOrderDate,
			daysSinceLastOrder,
			totalOrders,
			ytdOrders,
			lifetimeRevenue,
			ytdRevenue,
			avgOrderValue,
			yoyGrowth
		});
	}

	return healthMap;
}
