import type { SupabaseClient } from '@supabase/supabase-js';
import { computeAccountHealth } from './account-health.js';
import { supabaseAdmin } from './supabase.js';
import { listConnectedReps, listFederatedOrders } from './federation.js';

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

	// Determine org type — brand orgs get a different set of generators.
	// Use the injected client so this function is fully testable; callers
	// already pass an admin/user client appropriate to their context.
	const { data: org } = await supabase
		.from('organizations')
		.select('org_type')
		.eq('id', organizationId)
		.single();
	const orgType = (org as { org_type?: string } | null)?.org_type ?? 'rep';

	if (orgType === 'brand') {
		const results = await Promise.allSettled([
			computeBrandRepQuiet(organizationId),
			computeBrandOrderAwaitingConfirm(organizationId),
			computeBrandStyleAccelerating(organizationId),
			computeBrandTerritoryOrTopLapsed(organizationId)
		]);
		const labels = [
			'Brand: rep quiet',
			'Brand: order awaiting confirm',
			'Brand: style accelerating',
			'Brand: territory/top lapsed'
		];
		for (let i = 0; i < results.length; i++) {
			const r = results[i];
			if (r.status === 'fulfilled') allInsights.push(...r.value);
			else errors.push(`${labels[i]}: ${r.reason}`);
		}
	} else {
		const [leakageResult, gapResult, callQueueResult, overdueResult] = await Promise.allSettled([
			computeRevenueLeakage(supabase, organizationId),
			computeOrderGaps(supabase, organizationId),
			computeCallQueue(supabase, organizationId),
			computeOverdueOrders(supabase, organizationId)
		]);

		if (leakageResult.status === 'fulfilled') allInsights.push(...leakageResult.value);
		else errors.push(`Revenue leakage: ${leakageResult.reason}`);

		if (gapResult.status === 'fulfilled') allInsights.push(...gapResult.value);
		else errors.push(`Order gaps: ${gapResult.reason}`);

		if (callQueueResult.status === 'fulfilled') allInsights.push(...callQueueResult.value);
		else errors.push(`Call queue: ${callQueueResult.reason}`);

		if (overdueResult.status === 'fulfilled') allInsights.push(...overdueResult.value);
		else errors.push(`Overdue orders: ${overdueResult.reason}`);
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
					seasonName: (() => {
						const seasons = (d as { seasons?: { name?: string } | { name?: string }[] | null })
							?.seasons;
						if (!seasons) return '';
						if (Array.isArray(seasons)) return seasons[0]?.name ?? '';
						return seasons.name ?? '';
					})()
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
		const orderJoin = order as {
			accounts?: { business_name?: string } | { business_name?: string }[] | null;
			brands?: { name?: string } | { name?: string }[] | null;
		};
		const accountsJoin = orderJoin.accounts;
		const brandsJoin = orderJoin.brands;
		const accountName =
			(Array.isArray(accountsJoin)
				? accountsJoin[0]?.business_name
				: accountsJoin?.business_name) ?? 'Unknown';
		const brandName = (Array.isArray(brandsJoin) ? brandsJoin[0]?.name : brandsJoin?.name) ?? '';

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

// ═══════════════════════════════════════════════════════════════════════════
// Brand-side generators
// ═══════════════════════════════════════════════════════════════════════════
// All brand generators use the admin client (supabaseAdmin) directly because
// they cross org boundaries to read rep-org data (orders from federated links,
// rep org names, etc.). The outer filter is always pinned to the brand org id.

const BRAND_TTL_DAYS = 7;
function brandExpiry(): string {
	const d = new Date();
	d.setDate(d.getDate() + BRAND_TTL_DAYS);
	return d.toISOString();
}

// ── Rep going quiet ────────────────────────────────────────────────────────
// Active connection whose last order (via federation) is older than 30 days.

export async function computeBrandRepQuiet(brandOrgId: string): Promise<InsightAction[]> {
	const reps = await listConnectedReps(supabaseAdmin, brandOrgId);
	const now = Date.now();
	const out: InsightAction[] = [];
	for (const r of reps) {
		if (r.status !== 'active') continue;
		const reference = r.last_order_at ?? r.connected_at;
		if (!reference) continue;
		const days = Math.floor((now - new Date(reference).getTime()) / 86400000);
		if (days < 30) continue;
		out.push({
			organization_id: brandOrgId,
			user_id: null,
			insight_type: 'brand_rep_quiet',
			entity_type: 'connection',
			entity_id: r.connection_id,
			priority_score: Math.min(100, days * 2),
			title: `${r.rep_org_name} hasn't written in ${days} days`,
			description: `${r.order_count} orders · $${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} total revenue. Check in before the pipeline dries up.`,
			metadata: {
				rep_org_id: r.rep_org_id,
				rep_org_name: r.rep_org_name,
				days_quiet: days,
				revenue_total: r.revenue,
				order_count: r.order_count
			},
			status: 'active',
			expires_at: brandExpiry()
		});
	}
	return out.sort((a, b) => b.priority_score - a.priority_score);
}

// ── Order awaiting brand confirmation ──────────────────────────────────────
// Federated order stuck in `submitted` for 2+ days.

export async function computeBrandOrderAwaitingConfirm(
	brandOrgId: string
): Promise<InsightAction[]> {
	const orders = await listFederatedOrders(supabaseAdmin, brandOrgId);
	const now = Date.now();
	const out: InsightAction[] = [];
	for (const o of orders) {
		if (o.status !== 'submitted') continue;
		const days = Math.floor((now - new Date(o.created_at).getTime()) / 86400000);
		if (days < 2) continue;
		out.push({
			organization_id: brandOrgId,
			user_id: null,
			insight_type: 'brand_order_awaiting_confirm',
			entity_type: 'order',
			entity_id: o.id,
			priority_score: Math.min(100, 50 + days * 10),
			title: `${o.order_number ?? 'Order'} waiting ${days} days for your confirmation`,
			description: `${o.rep_org_name}${o.account_name ? ` · ${o.account_name}` : ''} — $${o.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}. Reps lose trust when confirmations lag.`,
			metadata: {
				order_id: o.id,
				order_number: o.order_number,
				rep_org_name: o.rep_org_name,
				account_name: o.account_name,
				total_amount: o.total_amount,
				days_waiting: days
			},
			status: 'active',
			expires_at: brandExpiry()
		});
	}
	return out.sort((a, b) => b.priority_score - a.priority_score);
}

// ── Style accelerating (WoW velocity jump) ────────────────────────────────
// Compare units ordered in the last 14 days vs the prior 14 days, grouped by
// style_number. Surface styles with >=50% jump and >=5 units in the latest
// window.

export async function computeBrandStyleAccelerating(brandOrgId: string): Promise<InsightAction[]> {
	const now = new Date();
	const t14 = new Date(now.getTime() - 14 * 86400000);
	const t28 = new Date(now.getTime() - 28 * 86400000);

	// Find federated order ids for this brand over the last 28 days.
	const { data: links } = await supabaseAdmin
		.from('federated_order_links')
		.select('order_id')
		.eq('target_org_id', brandOrgId)
		.eq('status', 'active')
		.gte('created_at', t28.toISOString());
	const orderIds = ((links ?? []) as Array<{ order_id: string }>).map((l) => l.order_id);
	if (orderIds.length === 0) return [];

	const { data: lineRows } = await supabaseAdmin
		.from('order_lines')
		.select('order_id, style_number, description, qty, orders(created_at)')
		.in('order_id', orderIds);
	type Line = {
		order_id: string;
		style_number: string | null;
		description: string | null;
		qty: number;
		orders: { created_at: string } | null;
	};
	const lines = ((lineRows ?? []) as unknown as Line[]).filter((l) => l.style_number);

	// Aggregate by style_number per window.
	const agg = new Map<string, { name: string; recent: number; prior: number }>();
	for (const l of lines) {
		if (!l.orders) continue;
		const when = new Date(l.orders.created_at).getTime();
		const style = l.style_number as string;
		const entry = agg.get(style) ?? { name: l.description ?? style, recent: 0, prior: 0 };
		if (when >= t14.getTime()) entry.recent += l.qty;
		else if (when >= t28.getTime()) entry.prior += l.qty;
		agg.set(style, entry);
	}

	const out: InsightAction[] = [];
	for (const [style, v] of agg) {
		if (v.recent < 5) continue;
		const prior = Math.max(v.prior, 1);
		const pct = (v.recent - prior) / prior;
		if (pct < 0.5) continue; // need >=50% jump
		out.push({
			organization_id: brandOrgId,
			user_id: null,
			insight_type: 'brand_style_accelerating',
			entity_type: 'style',
			entity_id: null,
			priority_score: Math.min(100, Math.round(pct * 100)),
			title: `${v.name} is accelerating — ${v.recent} units this week`,
			description: `Up from ${v.prior} units the prior 14d (+${Math.round(pct * 100)}%). Get ahead of the reorder.`,
			metadata: {
				style_number: style,
				product_name: v.name,
				units_recent: v.recent,
				units_prior: v.prior,
				pct_change: pct
			},
			status: 'active',
			expires_at: brandExpiry()
		});
	}
	return out.sort((a, b) => b.priority_score - a.priority_score);
}

// ── Territory or top-account lapsed ────────────────────────────────────────
// Two sub-types in one generator. Territory: had federated orders in the prior
// 12 months but none in the last 90 days. Top account: prior top-10 by 12mo
// federated revenue, silent for 60+ days.

export async function computeBrandTerritoryOrTopLapsed(
	brandOrgId: string
): Promise<InsightAction[]> {
	const orders = await listFederatedOrders(supabaseAdmin, brandOrgId);
	if (orders.length === 0) return [];

	const now = Date.now();
	const d60 = now - 60 * 86400000;
	const d90 = now - 90 * 86400000;
	const d365 = now - 365 * 86400000;

	// Top-account lapsed
	type Agg = { revenue: number; last: number };
	const byAccount = new Map<string, Agg>();
	for (const o of orders) {
		if (!o.account_id) continue;
		const created = new Date(o.created_at).getTime();
		if (created < d365) continue;
		const a = byAccount.get(o.account_id) ?? { revenue: 0, last: 0 };
		a.revenue += o.total_amount;
		if (created > a.last) a.last = created;
		byAccount.set(o.account_id, a);
	}
	const topIds = [...byAccount.entries()]
		.sort(([, a], [, b]) => b.revenue - a.revenue)
		.slice(0, 10)
		.map(([id]) => id);

	const lapsedTop = topIds.filter((id) => {
		const a = byAccount.get(id)!;
		return a.last < d60;
	});

	const { data: accountRows } = lapsedTop.length
		? await supabaseAdmin.from('accounts').select('id, business_name').in('id', lapsedTop)
		: { data: [] };
	const accountNames = new Map(
		((accountRows ?? []) as Array<{ id: string; business_name: string }>).map((a) => [
			a.id,
			a.business_name
		])
	);

	const out: InsightAction[] = [];
	for (const id of lapsedTop) {
		const a = byAccount.get(id)!;
		const days = Math.floor((now - a.last) / 86400000);
		out.push({
			organization_id: brandOrgId,
			user_id: null,
			insight_type: 'brand_top_account_lapsed',
			entity_type: 'account',
			entity_id: id,
			priority_score: Math.min(95, 60 + Math.min(days - 60, 30)),
			title: `${accountNames.get(id) ?? 'Top account'} hasn't ordered in ${days} days`,
			description: `$${a.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} over the last 12 months. Nudge the managing rep before they drift.`,
			metadata: {
				account_id: id,
				business_name: accountNames.get(id) ?? null,
				revenue_12mo: a.revenue,
				days_since_last_order: days
			},
			status: 'active',
			expires_at: brandExpiry()
		});
	}

	// Territory lapsed — needs accounts + territories for all account_ids that
	// appeared in the 12mo window.
	const allAccountIds = [...byAccount.keys()];
	if (allAccountIds.length > 0) {
		const { data: ter } = await supabaseAdmin
			.from('accounts')
			.select('id, territories!accounts_territory_id_fkey(id, name)')
			.in('id', allAccountIds);
		type Row = {
			id: string;
			territories: { id: string; name: string } | null;
		};
		const rows = (ter ?? []) as unknown as Row[];

		type TerritoryAgg = { name: string; priorRev: number; lastOrder: number };
		const territoryAgg = new Map<string, TerritoryAgg>();
		for (const row of rows) {
			if (!row.territories) continue;
			const acct = byAccount.get(row.id);
			if (!acct) continue;
			const e = territoryAgg.get(row.territories.id) ?? {
				name: row.territories.name,
				priorRev: 0,
				lastOrder: 0
			};
			e.priorRev += acct.revenue;
			if (acct.last > e.lastOrder) e.lastOrder = acct.last;
			territoryAgg.set(row.territories.id, e);
		}

		for (const [tid, t] of territoryAgg) {
			if (t.priorRev === 0) continue;
			if (t.lastOrder >= d90) continue; // still active
			const days = Math.floor((now - t.lastOrder) / 86400000);
			out.push({
				organization_id: brandOrgId,
				user_id: null,
				insight_type: 'brand_territory_lapsed',
				entity_type: 'territory',
				entity_id: tid,
				priority_score: Math.min(90, 50 + Math.min(days - 90, 30)),
				title: `${t.name} has been silent for ${days} days`,
				description: `Prior 12mo: $${t.priorRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}. Consider inviting a rep who covers this territory.`,
				metadata: {
					territory_id: tid,
					territory_name: t.name,
					prior_revenue: t.priorRev,
					days_silent: days
				},
				status: 'active',
				expires_at: brandExpiry()
			});
		}
	}

	return out.sort((a, b) => b.priority_score - a.priority_score);
}
