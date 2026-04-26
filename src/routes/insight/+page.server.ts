import type { PageServerLoad } from './$types';
import { computeAccountHealth } from '$lib/server/account-health.js';
import { refreshInsights } from '$lib/server/insights-engine.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listConnectedReps, listFederatedOrders } from '$lib/server/federation.js';
import { getNxBlsrBrandOrgIds, isNxBlsr } from '$lib/server/nx-blsr';

type BrandTopAccount = {
	account_id: string;
	business_name: string;
	city: string | null;
	state: string | null;
	revenue: number;
	order_count: number;
};

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('data:dashboard');
	const { supabase, organization, orgType, allMemberships } = locals;
	const brandOrgIds = getNxBlsrBrandOrgIds(allMemberships);
	const nxBlsr = isNxBlsr(brandOrgIds);

	if (!organization) {
		return {
			insightActions: [],
			scoreboard: [],
			seasonSummary: [],
			yearlySummary: [],
			selectedYear: null,
			availableYears: [],
			deliveries: [],
			gridAccounts: [],
			gridData: [],
			showDates: [],
			selectedShowDateId: null,
			showVisits: [],
			showOrders: [],
			showDeliveries: [],
			showSummary: [],
			showAppointments: [],
			styleVelocity: [],
			velocityWindow: 14
		};
	}

	const orgId = organization.id;

	// ── Brand org branch ────────────────────────────────────────────────
	// Note: Nx-BLSR users (sales in 2+ brand-orgs) DO NOT take this path.
	// loadBrandInsight is built for brand admins viewing federated rep activity;
	// Nx-BLSR users WRITE orders directly inside brand-orgs, so their orders
	// don't appear in `federated_order_links`. They fall through to the rep-style
	// branch below, which queries `orders` directly and unions across brandOrgIds.
	if (orgType === 'brand' && !nxBlsr) {
		const brandData = await loadBrandInsight(supabaseAdmin, orgId);
		const isBrandAdmin = ['admin', 'owner'].includes(locals.membership?.role ?? '');
		if (!isBrandAdmin) {
			brandData.brandChecklist = null;
		}
		return brandData;
	}

	// orgScope: union for Nx-BLSR (their brand-org IDs); single id otherwise.
	// Used for every list query in the rep-style branch below — replaces
	// `.in('organization_id', orgScope)` with `.in('organization_id', orgScope)`.
	const orgScope = nxBlsr ? brandOrgIds : [orgId];

	// ── Setup checklist (onboarding state) ──────────────────────────────
	// Nx-BLSR users are sales-role, not org-admin — they don't run onboarding.
	// Skip the checklist for them so they don't see "0 brands" against a rep-org
	// perspective they don't own.
	const [brandCountCheck, productCountCheck, accountCountCheck, orderCountCheck] = nxBlsr
		? [{ count: 1 }, { count: 1 }, { count: 1 }, { count: 1 }]
		: await Promise.all([
				supabase
					.from('brands')
					.select('id', { count: 'exact', head: true })
					.in('organization_id', orgScope)
					.eq('is_active', true),
				supabase
					.from('products')
					.select('id', { count: 'exact', head: true })
					.in('organization_id', orgScope)
					.eq('is_active', true),
				supabase
					.from('accounts')
					.select('id', { count: 'exact', head: true })
					.in('organization_id', orgScope)
					.eq('is_active', true),
				supabase
					.from('orders')
					.select('id', { count: 'exact', head: true })
					.in('organization_id', orgScope)
			]);

	const hasBrands = (brandCountCheck.count ?? 0) > 0;
	const hasProducts = (productCountCheck.count ?? 0) > 0;
	const hasAccounts = (accountCountCheck.count ?? 0) > 0;
	const hasOrders = (orderCountCheck.count ?? 0) > 0;
	const setupComplete = hasBrands && hasProducts && hasAccounts && hasOrders;

	// Get first brand ID for the "add products" link (rep-org onboarding only).
	let firstBrandId: string | null = null;
	if (!nxBlsr && hasBrands && !hasProducts) {
		const { data: firstBrand } = await supabase
			.from('brands')
			.select('id')
			.in('organization_id', orgScope)
			.eq('is_active', true)
			.limit(1)
			.single();
		firstBrandId = firstBrand?.id ?? null;
	}

	// If setup isn't complete, return early with just the checklist data
	if (!setupComplete) {
		return {
			setupComplete,
			setupChecklist: { hasBrands, hasProducts, hasAccounts, hasOrders, firstBrandId },
			insightActions: [],
			scoreboard: [],
			seasonSummary: [],
			yearlySummary: [],
			selectedYear: null,
			availableYears: [],
			deliveries: [],
			gridAccounts: [],
			gridData: [],
			showDates: [],
			selectedShowDateId: null,
			showVisits: [],
			showOrders: [],
			showDeliveries: [],
			showSummary: [],
			showAppointments: [],
			styleVelocity: [],
			velocityWindow: 14
		};
	}

	const isSales = locals.membership?.role === 'sales';
	const userId = locals.user?.id;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function scopeByRep(query: any) {
		return isSales && userId ? query.eq('created_by', userId) : query;
	}

	// Get available years from orders
	const { data: yearRows } = await scopeByRep(
		supabase
			.from('orders')
			.select('order_year')
			.in('organization_id', orgScope)
			.not('order_year', 'is', null)
			.order('order_year', { ascending: false })
	);

	const yearRowList = (yearRows ?? []) as Array<{ order_year: number | null }>;
	const availableYears: number[] = [
		...new Set(
			yearRowList.map((r) => r.order_year).filter((y: number | null): y is number => y !== null)
		)
	];

	const yearParam = url.searchParams.get('year');
	const selectedYear: number | null = yearParam
		? parseInt(yearParam, 10)
		: (availableYears[0] ?? null);

	// RPCs take a single org_id. For Nx-BLSR, run per orgId and concat the
	// row arrays — each RPC returns row-shaped data so flat concat is correct.
	const seasonRpc = (id: string) =>
		supabase.rpc('get_season_summary', { org_id: id, target_year: selectedYear });
	const yearlyRpc = (id: string) => supabase.rpc('get_yearly_summary', { org_id: id });
	const [seasonBatches, yearlyBatches] = await Promise.all([
		Promise.all(orgScope.map(seasonRpc)),
		Promise.all(orgScope.map(yearlyRpc))
	]);
	const seasonSummaryResult = {
		data: seasonBatches.flatMap((b) => b.data ?? []),
		error: seasonBatches.find((b) => b.error)?.error ?? null
	};
	const yearlySummaryResult = {
		data: yearlyBatches.flatMap((b) => b.data ?? []),
		error: yearlyBatches.find((b) => b.error)?.error ?? null
	};

	const seasonSummary = (seasonSummaryResult.data ?? []) as {
		season_name: string;
		sort_order: number;
		revenue: number;
		order_count: number;
	}[];

	const yearlySummary = (yearlySummaryResult.data ?? []) as {
		year: number;
		order_count: number;
		revenue: number;
		avg_order_value: number;
	}[];

	// ── Delivery grid data ──────────────────────────────────────────────

	// Load all season_deliveries for the org, joined with season info
	const { data: deliveryRows } = await supabase
		.from('season_deliveries')
		.select(
			'id, season_id, label, delivery_month, delivery_day, sort_order, seasons(name, sort_order)'
		)
		.in('organization_id', orgScope)
		.order('delivery_month', { ascending: true })
		.order('delivery_day', { ascending: true });

	const deliveries = (deliveryRows ?? []) as unknown as {
		id: string;
		season_id: string;
		label: string;
		delivery_month: number;
		delivery_day: number;
		sort_order: number;
		seasons: { name: string; sort_order: number } | null;
	}[];

	// Load active accounts for the org
	const { data: accountRows } = await supabase
		.from('accounts')
		.select('id, business_name, city, state, notes, is_active')
		.in('organization_id', orgScope)
		.eq('is_active', true)
		.order('business_name', { ascending: true });

	const gridAccounts = (accountRows ?? []) as {
		id: string;
		business_name: string;
		city: string | null;
		state: string | null;
		notes: string | null;
		is_active: boolean;
	}[];

	// Load aggregated order totals grouped by account_id, delivery_id, order_year
	// for the selected year and prior year
	let gridData: {
		account_id: string;
		delivery_id: string;
		order_year: number;
		total: number;
	}[] = [];

	if (selectedYear && deliveries.length > 0) {
		const priorYear = selectedYear - 1;

		const { data: orderAgg } = await scopeByRep(
			supabase
				.from('orders')
				.select('account_id, delivery_id, order_year, total_amount')
				.in('organization_id', orgScope)
				.not('delivery_id', 'is', null)
				.in('order_year', [selectedYear, priorYear])
		);

		// Aggregate in JS since supabase-js doesn't support GROUP BY with SUM
		const aggMap = new Map<string, number>();
		for (const row of orderAgg ?? []) {
			const key = `${row.account_id}|${row.delivery_id}|${row.order_year}`;
			aggMap.set(key, (aggMap.get(key) ?? 0) + (row.total_amount ?? 0));
		}

		gridData = Array.from(aggMap.entries()).map(([key, total]) => {
			const [account_id, delivery_id, order_year] = key.split('|');
			return { account_id, delivery_id, order_year: parseInt(order_year, 10), total };
		});
	}

	// ── Shows tab data ──────────────────────────────────────────────────

	// Load all show_dates joined with shows
	const { data: showDateRows } = await supabase
		.from('show_dates')
		.select('*, shows(name)')
		.in('organization_id', orgScope)
		.order('year')
		.order('month');

	const showDates = (showDateRows ?? []) as {
		id: string;
		show_id: string;
		organization_id: string;
		year: number;
		month: number;
		venue: string | null;
		city: string | null;
		state: string | null;
		start_date: string | null;
		end_date: string | null;
		notes: string | null;
		created_at: string;
		shows: { name: string } | null;
	}[];

	const selectedShowDateId = url.searchParams.get('show_date') ?? null;

	let showVisits: {
		id: string;
		organization_id: string;
		show_date_id: string;
		account_id: string;
		status: string;
		notes: string | null;
		is_new_account: boolean;
		created_by: string | null;
		created_at: string;
		updated_at: string;
		accounts: {
			id: string;
			business_name: string;
			contact_first_name: string | null;
			contact_last_name: string | null;
			city: string | null;
			state: string | null;
		} | null;
	}[] = [];

	let showOrders: {
		id: string;
		account_id: string;
		delivery_id: string | null;
		total_amount: number;
	}[] = [];

	let showDeliveries: {
		id: string;
		label: string;
		delivery_month: number;
		delivery_day: number;
		sort_order: number;
	}[] = [];

	// All-shows summary data (when no show selected)
	let showSummary: { showDateId: string; appointments: number; orders: number; revenue: number }[] =
		[];
	let showAppointments: Array<Record<string, unknown>> = [];

	if (selectedShowDateId) {
		const [visitsResult, ordersResult, deliveriesResult, appointmentsResult] = await Promise.all([
			scopeByRep(
				supabase
					.from('show_visits')
					.select(
						'id, organization_id, show_date_id, account_id, status, notes, is_new_account, created_by, created_at, updated_at, accounts(id, business_name, contact_first_name, contact_last_name, city, state), profiles!show_visits_created_by_fkey(display_name)'
					)
					.eq('show_date_id', selectedShowDateId)
					.in('organization_id', orgScope)
			),
			scopeByRep(
				supabase
					.from('orders')
					.select('id, account_id, delivery_id, total_amount')
					.eq('show_date_id', selectedShowDateId)
					.in('organization_id', orgScope)
			),
			supabase
				.from('season_deliveries')
				.select('id, label, delivery_month, delivery_day, sort_order')
				.in('organization_id', orgScope)
				.order('delivery_month', { ascending: true })
				.order('delivery_day', { ascending: true }),
			scopeByRep(
				supabase
					.from('appointments')
					.select(
						'*, accounts(id, business_name, contact_first_name, contact_last_name, city, state), profiles!appointments_created_by_fkey(display_name)'
					)
					.eq('show_date_id', selectedShowDateId)
					.in('organization_id', orgScope)
			)
		]);

		showVisits = (visitsResult.data ?? []) as unknown as typeof showVisits;
		showOrders = (ordersResult.data ?? []) as typeof showOrders;
		showDeliveries = (deliveriesResult.data ?? []) as typeof showDeliveries;
		showAppointments = (appointmentsResult.data ?? []) as Array<Record<string, unknown>>;
	} else if (showDates.length > 0) {
		// Load summary stats for all shows
		const showDateIds = showDates.map((sd) => sd.id);

		const [allApptsResult, allOrdersResult] = await Promise.all([
			scopeByRep(
				supabase
					.from('appointments')
					.select('id, show_date_id')
					.in('show_date_id', showDateIds)
					.in('organization_id', orgScope)
			),
			scopeByRep(
				supabase
					.from('orders')
					.select('id, show_date_id, total_amount')
					.in('show_date_id', showDateIds)
					.in('organization_id', orgScope)
			)
		]);

		const allAppts = (allApptsResult.data ?? []) as Array<{ id: string; show_date_id: string }>;
		const allOrders = (allOrdersResult.data ?? []) as Array<{
			id: string;
			show_date_id: string;
			total_amount: number;
		}>;

		showSummary = showDates.map((sd) => {
			const appts = allAppts.filter((a) => a.show_date_id === sd.id);
			const orders = allOrders.filter((o) => o.show_date_id === sd.id);
			return {
				showDateId: sd.id,
				appointments: appts.length,
				orders: orders.length,
				revenue: orders.reduce((sum, o) => sum + Number(o.total_amount), 0)
			};
		});
	}

	// ── Commissions tab data ───────────────────────────────────────────

	const commYearParam = url.searchParams.get('comm_year');
	const commBrandParam = url.searchParams.get('comm_brand');
	const commMonthParam = url.searchParams.get('comm_month');

	// Load brands for the commission brand filter dropdown
	const { data: commBrandRows } = await supabase
		.from('brands')
		.select('id, name, commission_rate')
		.in('organization_id', orgScope)
		.eq('is_active', true)
		.order('name', { ascending: true });

	const commissionBrands = (commBrandRows ?? []) as {
		id: string;
		name: string;
		commission_rate: number;
	}[];

	// Load commission overrides for the org
	const { data: overrideRows } = await supabase
		.from('commission_overrides')
		.select('id, brand_id, account_id, rate')
		.in('organization_id', orgScope);

	const commissionOverrides = (overrideRows ?? []) as {
		id: string;
		brand_id: string;
		account_id: string;
		rate: number;
	}[];

	// Load shipped/delivered orders for commission calculation
	// Uses shipped_amount if set, falls back to total_amount
	let commissionQuery = supabase
		.from('orders')
		.select(
			'id, order_number, account_id, brand_id, season_id, order_year, total_amount, shipped_amount, shipped_at, brands(name, commission_rate), accounts(business_name), seasons(name)'
		)
		.in('organization_id', orgScope)
		.in('status', ['shipped', 'delivered']);

	if (commYearParam) {
		commissionQuery = commissionQuery.eq('order_year', parseInt(commYearParam, 10));
	}

	if (commBrandParam) {
		commissionQuery = commissionQuery.eq('brand_id', commBrandParam);
	}

	if (commMonthParam) {
		// Filter by month of shipped_at: use gte/lt for the month range
		// We need a year context for month filtering
		const filterYear = commYearParam ? parseInt(commYearParam, 10) : new Date().getFullYear();
		const monthNum = parseInt(commMonthParam, 10);
		const startDate = `${filterYear}-${String(monthNum).padStart(2, '0')}-01`;
		const endMonth = monthNum === 12 ? 1 : monthNum + 1;
		const endYear = monthNum === 12 ? filterYear + 1 : filterYear;
		const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
		commissionQuery = commissionQuery.gte('shipped_at', startDate).lt('shipped_at', endDate);
	}

	commissionQuery = commissionQuery.order('shipped_at', { ascending: false });

	const { data: commOrderRows } = await scopeByRep(commissionQuery);

	const commissionOrders = (commOrderRows ?? []) as unknown as {
		id: string;
		order_number: string;
		account_id: string;
		brand_id: string;
		season_id: string | null;
		order_year: number | null;
		total_amount: number;
		shipped_amount: number;
		shipped_at: string | null;
		brands: { name: string; commission_rate: number } | null;
		accounts: { business_name: string } | null;
		seasons: { name: string } | null;
	}[];

	// ── Style velocity data ───────────────────────────────────────────

	const velocityWindowParam = url.searchParams.get('velocity_window');
	const velocityWindow = velocityWindowParam ? parseInt(velocityWindowParam, 10) : 14;

	// Style velocity RPC: union per orgId for Nx-BLSR.
	const velocityBatches = await Promise.all(
		orgScope.map((id) =>
			supabase.rpc('get_style_velocity', {
				org_id: id,
				days_back: velocityWindow,
				min_accounts: 2
			})
		)
	);
	const velocityData = velocityBatches.flatMap((b) => b.data ?? []);

	const styleVelocity = (velocityData ?? []) as {
		style_number: string;
		product_name: string | null;
		brand_name: string;
		account_count: number;
		order_count: number;
		total_qty: number;
		total_revenue: number;
		avg_qty_per_account: number;
		first_ordered: string;
		latest_ordered: string;
		top_colors: string[];
	}[];

	// ── Insight Actions (pre-computed) ──────────────────────────────────
	let { data: insightRows } = await supabase
		.from('insight_actions')
		.select('*')
		.in('organization_id', orgScope)
		.eq('status', 'active')
		.order('priority_score', { ascending: false });

	// Auto-compute on first visit if no insights exist yet (per-org for Nx-BLSR).
	if (!insightRows || insightRows.length === 0) {
		for (const id of orgScope) {
			await refreshInsights(supabase, id);
		}
		const refreshed = await supabase
			.from('insight_actions')
			.select('*')
			.in('organization_id', orgScope)
			.eq('status', 'active')
			.order('priority_score', { ascending: false });
		insightRows = refreshed.data;
	}

	const insightActions = (insightRows ?? []) as {
		id: string;
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
		created_at: string;
	}[];

	// ── Scoreboard KPIs ─────────────────────────────────────────────────
	const healthMap = await computeAccountHealth(supabase, orgScope);
	const healthValues = Array.from(healthMap.values());
	const atRiskCount = healthValues.filter((h) => h.label === 'at_risk').length;
	const totalAccounts = healthValues.length;
	const avgHealthScore =
		totalAccounts > 0
			? Math.round(healthValues.reduce((sum, h) => sum + h.score, 0) / totalAccounts)
			: 0;

	// YTD revenue from yearly summary
	const currentYear = new Date().getFullYear();
	const ytdRevRow = yearlySummary.find((y: { year: number }) => y.year === currentYear);
	const priorRevRow = yearlySummary.find((y: { year: number }) => y.year === currentYear - 1);
	const ytdRevenue = (ytdRevRow as { revenue?: number } | undefined)?.revenue ?? 0;
	const priorRevenue = (priorRevRow as { revenue?: number } | undefined)?.revenue ?? 0;
	const revenueChange =
		priorRevenue > 0 ? ((ytdRevenue - priorRevenue) / priorRevenue) * 100 : null;

	const ytdOrderCount = (ytdRevRow as { order_count?: number } | undefined)?.order_count ?? 0;
	const priorOrderCount = (priorRevRow as { order_count?: number } | undefined)?.order_count ?? 0;
	const orderChange =
		priorOrderCount > 0 ? ((ytdOrderCount - priorOrderCount) / priorOrderCount) * 100 : null;

	const scoreboard = [
		{
			label: 'YTD Revenue',
			value: `$${ytdRevenue >= 1000 ? (ytdRevenue / 1000).toFixed(0) + 'K' : ytdRevenue.toLocaleString()}`,
			change: revenueChange,
			detail: `${currentYear}`
		},
		{
			label: 'YTD Orders',
			value: String(ytdOrderCount),
			change: orderChange,
			detail: `${currentYear}`
		},
		{
			label: 'Avg Health Score',
			value: `${avgHealthScore}/100`,
			change: null,
			detail: `${totalAccounts} accounts`
		},
		{
			label: 'At-Risk Accounts',
			value: String(atRiskCount),
			change: null,
			detail: atRiskCount > 0 ? 'Need attention' : 'All clear'
		},
		{
			label: 'Action Items',
			value: String(insightActions.length),
			change: null,
			detail: 'Pending actions'
		}
	];

	return {
		setupComplete,
		insightActions,
		scoreboard,
		seasonSummary,
		yearlySummary,
		selectedYear,
		availableYears,
		deliveries,
		gridAccounts,
		gridData,
		showDates,
		selectedShowDateId,
		showVisits,
		showOrders,
		showDeliveries,
		showSummary,
		showAppointments,
		commissionOrders,
		commissionOverrides,
		commissionBrands,
		commYearParam,
		commBrandParam,
		commMonthParam,
		styleVelocity,
		velocityWindow
	};
};

// ───────────────────────────────────────────────────────────────────────────
// Brand-org Insight loader
// ───────────────────────────────────────────────────────────────────────────

async function loadBrandInsight(admin: typeof supabaseAdmin, brandOrgIdInput: string | string[]) {
	// Single-brand callers pass a string; Nx-BLSR (multi-brand-sales) passes the
	// array of brand-org IDs they belong to. Internally we normalize to array
	// and union helpers + queries across them.
	const brandOrgIds = Array.isArray(brandOrgIdInput) ? brandOrgIdInput : [brandOrgIdInput];
	const primaryOrgId = brandOrgIds[0];

	// Refresh insight_actions on every visit — cheap, and keeps cards fresh against
	// newly quiet reps, newly submitted orders, etc. Run per-org for Nx-BLSR.
	for (const id of brandOrgIds) {
		try {
			await refreshInsights(admin, id);
		} catch {
			// Best-effort; fall through.
		}
	}

	const { data: insightRows } = await admin
		.from('insight_actions')
		.select('*')
		.in('organization_id', brandOrgIds)
		.eq('status', 'active')
		.order('priority_score', { ascending: false });

	const insightActions = (insightRows ?? []) as Array<{
		id: string;
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
		created_at: string;
	}>;

	const now = new Date();
	const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
	const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

	// Federation helpers are single-org. For Nx-BLSR, run them per-org and concat.
	// Brand A and Brand B may both have their own connected reps / federated orders;
	// this just unions the lists. Federation mechanism itself is unchanged.
	const repBatches = await Promise.all(brandOrgIds.map((id) => listConnectedReps(admin, id)));
	const orderBatches = await Promise.all(brandOrgIds.map((id) => listFederatedOrders(admin, id)));
	const connectedReps = repBatches.flat();
	const federatedOrders = orderBatches.flat();

	// Rep activity
	const activeReps = connectedReps.filter((r) => r.status === 'active');
	const repsActive30d = activeReps.filter(
		(r) => r.last_order_at && new Date(r.last_order_at) >= d30
	);
	const repsQuiet30d = activeReps.filter(
		(r) => !r.last_order_at || new Date(r.last_order_at) < d30
	);

	// Aggregates
	const pipelineStatuses = new Set(['draft', 'submitted', 'confirmed']);
	let pipelineValue = 0;
	let incoming30Count = 0;
	let incoming30Revenue = 0;

	// Account revenue (90d) — used for top-territory + top-accounts list.
	const accountAgg90d = new Map<string, { revenue: number; order_count: number }>();
	for (const o of federatedOrders) {
		const created = new Date(o.created_at);
		if (created >= d30) {
			incoming30Count++;
			incoming30Revenue += o.total_amount;
		}
		if (pipelineStatuses.has(o.status)) pipelineValue += o.total_amount;
		if (created >= d90 && o.account_id) {
			const e = accountAgg90d.get(o.account_id) ?? { revenue: 0, order_count: 0 };
			e.revenue += o.total_amount;
			e.order_count += 1;
			accountAgg90d.set(o.account_id, e);
		}
	}

	// ── Top accounts + territory list (browse data + scoreboard inputs) ──────
	const accountIds = [...accountAgg90d.keys()];
	type AccountRow = {
		id: string;
		business_name: string;
		city: string | null;
		state: string | null;
		territory_id: string | null;
		territories: { id: string; name: string } | null;
	};
	let accountRows: AccountRow[] = [];
	if (accountIds.length > 0) {
		const { data } = await admin
			.from('accounts')
			.select(
				'id, business_name, city, state, territory_id, territories!accounts_territory_id_fkey(id, name)'
			)
			.in('id', accountIds);
		accountRows = (data ?? []) as unknown as AccountRow[];
	}
	const accountMap = new Map(accountRows.map((a) => [a.id, a]));

	const topAccounts: BrandTopAccount[] = accountIds
		.map((id) => {
			const a = accountMap.get(id);
			const agg = accountAgg90d.get(id)!;
			return {
				account_id: id,
				business_name: a?.business_name ?? 'Unknown',
				city: a?.city ?? null,
				state: a?.state ?? null,
				revenue: agg.revenue,
				order_count: agg.order_count
			};
		})
		.sort((a, b) => b.revenue - a.revenue)
		.slice(0, 5);

	// Territory rollup (scoreboard leader + gaps list)
	const territoryRevenue = new Map<string, { name: string; revenue: number; hasActive: boolean }>();
	for (const row of accountRows) {
		if (!row.territories) continue;
		const agg = accountAgg90d.get(row.id);
		const e = territoryRevenue.get(row.territories.id) ?? {
			name: row.territories.name,
			revenue: 0,
			hasActive: false
		};
		if (agg) {
			e.revenue += agg.revenue;
			e.hasActive = true;
		}
		territoryRevenue.set(row.territories.id, e);
	}
	const topTerritory =
		[...territoryRevenue.values()]
			.filter((t) => t.hasActive)
			.sort((a, b) => b.revenue - a.revenue)[0] ?? null;
	const territoryGaps = [...territoryRevenue.values()]
		.filter((t) => !t.hasActive)
		.map((t) => ({ name: t.name }));

	// ── Style Leader (14d top style by units across federated orders) ────────
	type StyleAgg = { name: string; units: number };
	const styleAgg = new Map<string, StyleAgg>();
	const recentOrderIds = federatedOrders
		.filter((o) => new Date(o.created_at) >= d14)
		.map((o) => o.id);
	if (recentOrderIds.length > 0) {
		const { data: lineRows } = await admin
			.from('order_lines')
			.select('style_number, description, qty')
			.in('order_id', recentOrderIds);
		type Line = { style_number: string | null; description: string | null; qty: number };
		for (const l of (lineRows ?? []) as Line[]) {
			if (!l.style_number) continue;
			const e = styleAgg.get(l.style_number) ?? {
				name: l.description ?? l.style_number,
				units: 0
			};
			e.units += l.qty;
			styleAgg.set(l.style_number, e);
		}
	}
	const styleLeader =
		[...styleAgg.entries()]
			.map(([style_number, v]) => ({ style_number, name: v.name, units: v.units }))
			.sort((a, b) => b.units - a.units)[0] ?? null;

	// ── Scoreboard (5 tiles, matching rep shape) ──────────────────────────────
	const fmtMoney = (n: number) =>
		n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n).toLocaleString()}`;
	const scoreboard = [
		{
			label: 'Active Reps (30d)',
			value: `${repsActive30d.length}/${activeReps.length}`,
			change: null,
			detail: repsQuiet30d.length > 0 ? `${repsQuiet30d.length} quiet` : 'All writing this month'
		},
		{
			label: 'Incoming 30d',
			value: fmtMoney(incoming30Revenue),
			change: null,
			detail: `${incoming30Count} order${incoming30Count === 1 ? '' : 's'}`
		},
		{
			label: 'Open Pipeline',
			value: fmtMoney(pipelineValue),
			change: null,
			detail: 'Draft / submitted / confirmed'
		},
		{
			label: 'Top Territory',
			value: topTerritory?.name ?? '—',
			change: null,
			detail: topTerritory ? `${fmtMoney(topTerritory.revenue)} in 90d` : 'No territory data'
		},
		{
			label: 'Style Leader',
			value: styleLeader?.name ?? '—',
			change: null,
			detail: styleLeader ? `${styleLeader.units} units in 14d` : 'No velocity yet'
		}
	];

	// ── Onboarding checklist (Phase C) ────────────────────────────────────────
	// Checklist is rendered against a single brand org (it's the brand-admin's
	// onboarding state); for Nx-BLSR the caller pins brandChecklist to null
	// anyway (the caller is sales role, not admin), so primaryOrgId is fine here.
	const [productCount, teammateCount, salesRepCount] = await Promise.all([
		admin.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
		admin
			.from('organization_members')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', primaryOrgId),
		admin
			.from('organization_members')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', primaryOrgId)
			.eq('role', 'sales')
	]);
	const hasProducts = (productCount.count ?? 0) > 0;
	// "Connected rep" = either a federated rep-agency connection OR an internal sales rep on /reps.
	const hasConnectedRep = activeReps.length > 0 || (salesRepCount.count ?? 0) > 0;
	const hasOrder = federatedOrders.length > 0;
	const hasTeammates = (teammateCount.count ?? 0) > 1;
	const checklist = {
		hasProducts,
		hasConnectedRep,
		hasOrder,
		hasTeammates,
		complete: hasProducts && hasConnectedRep && hasOrder && hasTeammates
	};

	// Browse-the-data payload (demoted but preserved)
	const browse = {
		connectedReps,
		repsActive30d,
		repsQuiet30d,
		topAccounts,
		territoryGaps,
		totalOrders: federatedOrders.length,
		totalRevenue: federatedOrders.reduce((s, o) => s + o.total_amount, 0)
	};

	return {
		isBrandOrg: true,
		setupComplete: true,
		insightActions,
		scoreboard,
		brandBrowse: browse,
		brandChecklist: checklist as typeof checklist | null,
		// Rep-centric fields left empty so the shared page's type stays stable.
		seasonSummary: [],
		yearlySummary: [],
		selectedYear: null,
		availableYears: [],
		deliveries: [],
		gridAccounts: [],
		gridData: [],
		showDates: [],
		selectedShowDateId: null,
		showVisits: [],
		showOrders: [],
		showDeliveries: [],
		showSummary: [],
		showAppointments: [],
		styleVelocity: [],
		velocityWindow: 14
	};
}
