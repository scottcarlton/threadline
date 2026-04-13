import type { SupabaseClient } from '@supabase/supabase-js';
import { computeAccountHealth } from './account-health.js';

export type InsightAction = {
	organization_id: string;
	user_id: string | null;
	insight_type: string;
	entity_type: string | null;
	entity_id: string | null;
	priority_score: number;
	title: string;
	description: string;
	metadata: Record<string, unknown>;
	status: string;
	expires_at: string | null;
};

/**
 * Master refresh: computes all insight types and upserts into insight_actions.
 * Called via POST /api/insight/refresh.
 */
export async function refreshInsights(
	supabase: SupabaseClient,
	organizationId: string
): Promise<{ inserted: number; errors: string[] }> {
	const errors: string[] = [];
	const allInsights: InsightAction[] = [];

	// Run all computations in parallel
	const [leakageResult, gapResult, callQueueResult, overdueResult] = await Promise.allSettled([
		computeRevenueLeakage(supabase, organizationId),
		computeOrderGaps(supabase, organizationId),
		computeCallQueue(supabase, organizationId),
		computeOverdueOrders(supabase, organizationId)
	]);

	if (leakageResult.status === 'fulfilled') {
		allInsights.push(...leakageResult.value);
	} else {
		errors.push(`Revenue leakage: ${leakageResult.reason}`);
	}

	if (gapResult.status === 'fulfilled') {
		allInsights.push(...gapResult.value);
	} else {
		errors.push(`Order gaps: ${gapResult.reason}`);
	}

	if (callQueueResult.status === 'fulfilled') {
		allInsights.push(...callQueueResult.value);
	} else {
		errors.push(`Call queue: ${callQueueResult.reason}`);
	}

	if (overdueResult.status === 'fulfilled') {
		allInsights.push(...overdueResult.value);
	} else {
		errors.push(`Overdue orders: ${overdueResult.reason}`);
	}

	// Clear old active insights for this org (replace with fresh set)
	await supabase
		.from('insight_actions')
		.delete()
		.eq('organization_id', organizationId)
		.eq('status', 'active');

	// Insert new insights
	let inserted = 0;
	if (allInsights.length > 0) {
		const { error } = await supabase.from('insight_actions').insert(allInsights);

		if (error) {
			errors.push(`Insert failed: ${error.message}`);
		} else {
			inserted = allInsights.length;
		}
	}

	return { inserted, errors };
}

// ── Revenue Leakage Detector ────────────────────────────────────────────
// Accounts that ordered last year but NOT this year, ranked by prior revenue.

export async function computeRevenueLeakage(
	supabase: SupabaseClient,
	organizationId: string
): Promise<InsightAction[]> {
	const currentYear = new Date().getFullYear();
	const priorYear = currentYear - 1;

	// Get orders for prior year and current year
	const { data: orders } = await supabase
		.from('orders')
		.select('account_id, order_year, total_amount')
		.eq('organization_id', organizationId)
		.neq('status', 'cancelled')
		.in('order_year', [currentYear, priorYear]);

	if (!orders || orders.length === 0) return [];

	// Aggregate by account + year
	const accountYearRevenue = new Map<string, { prior: number; current: number }>();
	for (const o of orders) {
		const entry = accountYearRevenue.get(o.account_id) ?? { prior: 0, current: 0 };
		if (o.order_year === priorYear) {
			entry.prior += Number(o.total_amount);
		} else if (o.order_year === currentYear) {
			entry.current += Number(o.total_amount);
		}
		accountYearRevenue.set(o.account_id, entry);
	}

	// Find accounts with prior revenue but no current revenue
	const lapsedAccountIds: string[] = [];
	const lapsedRevenue = new Map<string, number>();
	for (const [accountId, rev] of accountYearRevenue) {
		if (rev.prior > 0 && rev.current === 0) {
			lapsedAccountIds.push(accountId);
			lapsedRevenue.set(accountId, rev.prior);
		}
	}

	if (lapsedAccountIds.length === 0) return [];

	// Get account names
	const { data: accounts } = await supabase
		.from('accounts')
		.select('id, business_name')
		.in('id', lapsedAccountIds);

	const nameMap = new Map((accounts ?? []).map((a) => [a.id, a.business_name]));

	// Build insights sorted by prior revenue (highest first)
	const sorted = lapsedAccountIds
		.map((id) => ({ id, revenue: lapsedRevenue.get(id) ?? 0 }))
		.sort((a, b) => b.revenue - a.revenue);

	return sorted.map((account, index) => ({
		organization_id: organizationId,
		user_id: null,
		insight_type: 'revenue_leakage',
		entity_type: 'account',
		entity_id: account.id,
		priority_score: Math.min(
			95,
			70 + Math.round((account.revenue / (sorted[0].revenue || 1)) * 25)
		),
		title: `${nameMap.get(account.id) ?? 'Unknown'} hasn't ordered in ${currentYear}`,
		description: `Ordered $${account.revenue.toLocaleString()} in ${priorYear} but nothing this year. Re-engage to recover revenue.`,
		metadata: {
			prior_year: priorYear,
			prior_revenue: account.revenue,
			current_year: currentYear,
			rank: index + 1,
			total_lapsed: sorted.length
		},
		status: 'active',
		expires_at: null
	}));
}

// ── Order Gap Detector ──────────────────────────────────────────────────
// Delivery windows that had orders last year but are empty this year.

export async function computeOrderGaps(
	supabase: SupabaseClient,
	organizationId: string
): Promise<InsightAction[]> {
	const currentYear = new Date().getFullYear();
	const priorYear = currentYear - 1;

	// Load delivery windows
	const { data: deliveries } = await supabase
		.from('season_deliveries')
		.select('id, label, delivery_month, delivery_day, seasons(name)')
		.eq('organization_id', organizationId)
		.order('delivery_month', { ascending: true });

	if (!deliveries || deliveries.length === 0) return [];

	// Load orders for both years with delivery assignments
	const { data: orders } = await supabase
		.from('orders')
		.select('account_id, delivery_id, order_year, total_amount')
		.eq('organization_id', organizationId)
		.neq('status', 'cancelled')
		.not('delivery_id', 'is', null)
		.in('order_year', [currentYear, priorYear]);

	if (!orders || orders.length === 0) return [];

	// Build lookup: "accountId|deliveryId|year" -> total
	const gridLookup = new Map<string, number>();
	for (const o of orders) {
		const key = `${o.account_id}|${o.delivery_id}|${o.order_year}`;
		gridLookup.set(key, (gridLookup.get(key) ?? 0) + Number(o.total_amount));
	}

	// Find gaps: had order in prior year delivery window, no order in current year
	const gaps: {
		accountId: string;
		deliveryId: string;
		priorAmount: number;
		deliveryLabel: string;
		seasonName: string;
	}[] = [];

	const accountIds = new Set(orders.map((o) => o.account_id));
	const deliveryMap = new Map(deliveries.map((d) => [d.id, d]));

	// Only check delivery windows that haven't passed yet (upcoming or current month)
	const currentMonth = new Date().getMonth() + 1;

	for (const accountId of accountIds) {
		for (const delivery of deliveries) {
			// Skip past delivery windows
			if (delivery.delivery_month < currentMonth) continue;

			const priorKey = `${accountId}|${delivery.id}|${priorYear}`;
			const currentKey = `${accountId}|${delivery.id}|${currentYear}`;
			const priorAmount = gridLookup.get(priorKey);
			const currentAmount = gridLookup.get(currentKey);

			if (priorAmount && priorAmount > 0 && !currentAmount) {
				const d = deliveryMap.get(delivery.id);
				gaps.push({
					accountId,
					deliveryId: delivery.id,
					priorAmount,
					deliveryLabel: d?.label ?? `${delivery.delivery_month}/${delivery.delivery_day}`,
					seasonName: (d as any)?.seasons?.name ?? ''
				});
			}
		}
	}

	if (gaps.length === 0) return [];

	// Get account names
	const gapAccountIds = [...new Set(gaps.map((g) => g.accountId))];
	const { data: accounts } = await supabase
		.from('accounts')
		.select('id, business_name')
		.in('id', gapAccountIds);

	const nameMap = new Map((accounts ?? []).map((a) => [a.id, a.business_name]));

	// Sort by prior amount descending
	gaps.sort((a, b) => b.priorAmount - a.priorAmount);

	return gaps.map((gap) => ({
		organization_id: organizationId,
		user_id: null,
		insight_type: 'order_gap',
		entity_type: 'account',
		entity_id: gap.accountId,
		priority_score: Math.min(
			90,
			60 + Math.round((gap.priorAmount / (gaps[0].priorAmount || 1)) * 30)
		),
		title: `${nameMap.get(gap.accountId) ?? 'Unknown'} missing ${gap.deliveryLabel} order`,
		description: `Ordered $${gap.priorAmount.toLocaleString()} for ${gap.seasonName} ${gap.deliveryLabel} last year but no order yet for ${currentYear}.`,
		metadata: {
			delivery_id: gap.deliveryId,
			delivery_label: gap.deliveryLabel,
			season_name: gap.seasonName,
			prior_year: priorYear,
			prior_amount: gap.priorAmount,
			current_year: currentYear
		},
		status: 'active',
		expires_at: null
	}));
}

// ── "Who to Call Today" Queue ───────────────────────────────────────────
// Prioritized list of accounts needing contact, with specific reasons.

export async function computeCallQueue(
	supabase: SupabaseClient,
	organizationId: string
): Promise<InsightAction[]> {
	const healthMap = await computeAccountHealth(supabase, organizationId);
	const today = new Date().toISOString().split('T')[0];
	const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

	// Get upcoming appointments (next 7 days)
	const { data: upcomingAppts } = await supabase
		.from('appointments')
		.select('id, account_id, scheduled_date, scheduled_time')
		.eq('organization_id', organizationId)
		.eq('status', 'scheduled')
		.gte('scheduled_date', today)
		.lte('scheduled_date', sevenDaysOut);

	const apptsByAccount = new Map<string, { date: string; time: string | null }>();
	for (const appt of upcomingAppts ?? []) {
		apptsByAccount.set(appt.account_id, {
			date: appt.scheduled_date,
			time: appt.scheduled_time
		});
	}

	// Get account names
	const allAccountIds = [...healthMap.keys()];
	const { data: accounts } = await supabase
		.from('accounts')
		.select('id, business_name')
		.in('id', allAccountIds.length > 0 ? allAccountIds : ['__none__']);

	const nameMap = new Map((accounts ?? []).map((a) => [a.id, a.business_name]));

	// Score each account for call priority
	type CallCandidate = {
		accountId: string;
		score: number;
		reasons: string[];
		metadata: Record<string, unknown>;
	};

	const candidates: CallCandidate[] = [];

	for (const [accountId, health] of healthMap) {
		let callScore = 0;
		const reasons: string[] = [];
		const meta: Record<string, unknown> = {
			health_score: health.score,
			health_label: health.label,
			days_since_last_order: health.daysSinceLastOrder,
			ytd_revenue: health.ytdRevenue,
			lifetime_revenue: health.lifetimeRevenue
		};

		// At-risk or declining accounts get highest priority
		if (health.label === 'at_risk') {
			callScore += 40;
			reasons.push('Account health is at risk');
		} else if (health.label === 'fair') {
			callScore += 20;
		}

		// Declining YoY
		if (health.yoyGrowth !== null && health.yoyGrowth < -20) {
			callScore += 25;
			reasons.push(`Revenue down ${Math.abs(Math.round(health.yoyGrowth))}% year-over-year`);
		}

		// No orders this year but ordered before
		if (health.ytdOrders === 0 && health.totalOrders > 0) {
			callScore += 30;
			reasons.push('No orders yet this year');
		}

		// Long time since last order (90+ days)
		if (health.daysSinceLastOrder !== null && health.daysSinceLastOrder > 90) {
			callScore += 15;
			reasons.push(`Last order ${health.daysSinceLastOrder} days ago`);
		}

		// Upcoming appointment (prep reminder)
		const appt = apptsByAccount.get(accountId);
		if (appt) {
			callScore += 20;
			reasons.push(`Appointment on ${appt.date}`);
			meta.appointment_date = appt.date;
			meta.appointment_time = appt.time;
		}

		// Only include accounts worth calling (score > 20)
		if (callScore > 20 && reasons.length > 0) {
			candidates.push({ accountId, score: callScore, reasons, metadata: meta });
		}
	}

	// Sort by score descending, limit to top 15
	candidates.sort((a, b) => b.score - a.score);
	const topCandidates = candidates.slice(0, 15);

	return topCandidates.map((c) => ({
		organization_id: organizationId,
		user_id: null,
		insight_type: 'call_queue',
		entity_type: 'account',
		entity_id: c.accountId,
		priority_score: Math.min(95, 50 + c.score),
		title: `Call ${nameMap.get(c.accountId) ?? 'Unknown'}`,
		description: c.reasons.join('. ') + '.',
		metadata: c.metadata,
		status: 'active',
		expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // expires in 24h
	}));
}

// ── Overdue Orders ──────────────────────────────────────────────────────
// Orders past their expected ship date that are still in confirmed/submitted status.

export async function computeOverdueOrders(
	supabase: SupabaseClient,
	organizationId: string
): Promise<InsightAction[]> {
	const today = new Date().toISOString().split('T')[0];

	const { data: overdueOrders } = await supabase
		.from('orders')
		.select(
			'id, order_number, total_amount, expected_ship_date, status, account_id, brand_id, accounts(business_name), brands(name)'
		)
		.eq('organization_id', organizationId)
		.in('status', ['confirmed', 'submitted'])
		.lt('expected_ship_date', today)
		.not('expected_ship_date', 'is', null)
		.order('expected_ship_date', { ascending: true });

	if (!overdueOrders || overdueOrders.length === 0) return [];

	return overdueOrders.map((order) => {
		const shipDate = new Date(order.expected_ship_date);
		const daysOverdue = Math.floor((Date.now() - shipDate.getTime()) / (1000 * 60 * 60 * 24));
		const accountName = (order as any).accounts?.business_name ?? 'Unknown';
		const brandName = (order as any).brands?.name ?? '';

		return {
			organization_id: organizationId,
			user_id: null,
			insight_type: 'overdue_order',
			entity_type: 'order',
			entity_id: order.id,
			priority_score: Math.min(95, 75 + Math.min(daysOverdue, 20)),
			title: `${order.order_number} is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`,
			description: `${accountName}${brandName ? ` / ${brandName}` : ''} — $${Number(order.total_amount).toLocaleString()} expected to ship ${order.expected_ship_date}. Currently ${order.status}.`,
			metadata: {
				order_number: order.order_number,
				total_amount: Number(order.total_amount),
				expected_ship_date: order.expected_ship_date,
				days_overdue: daysOverdue,
				status: order.status,
				account_id: order.account_id,
				account_name: accountName,
				brand_name: brandName
			},
			status: 'active',
			expires_at: null
		};
	});
}
