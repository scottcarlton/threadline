import type { PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { listFederatedOrders } from '$lib/server/federation.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase, organization, orgType } = locals;

	const status = url.searchParams.get('status');
	const seasonId = url.searchParams.get('season');
	const year = url.searchParams.get('year');
	const brandId = url.searchParams.get('brand');
	const showDateId = url.searchParams.get('show');
	const repOrgId = url.searchParams.get('rep');

	// Buyer-scoped orders
	if (locals.isBuyer) {
		const accountIds = locals.buyerAccounts?.map((a) => a.account_id) ?? [];
		const buyerBrandIds = locals.buyerBrandIds ?? [];

		let query = supabase
			.from('orders')
			.select('*, brands(name), accounts(business_name), seasons(name)')
			.in('account_id', accountIds)
			.order('created_at', { ascending: false });

		if (status) query = query.eq('status', status);
		if (brandId) query = query.eq('brand_id', brandId);
		if (seasonId) query = query.eq('season_id', seasonId);

		const [ordersRes, brandsRes] = await Promise.all([
			query,
			supabase
				.from('brands')
				.select('id, name')
				.in('id', buyerBrandIds.length > 0 ? buyerBrandIds : ['__none__'])
				.eq('is_active', true)
				.order('name')
		]);

		const orders = ordersRes.data ?? [];
		return {
			orders,
			seasons: [],
			brands: brandsRes.data ?? [],
			showDates: [],
			reps: [] as Array<{ id: string; name: string }>,
			isBrandOrg: false,
			metrics: {
				pipelineValue: orders
					.filter((o) => ['draft', 'submitted', 'confirmed'].includes(o.status))
					.reduce((s, o) => s + Number(o.total_amount), 0),
				pipelineCount: orders.filter((o) => ['draft', 'submitted', 'confirmed'].includes(o.status))
					.length,
				deliveredRevenue: orders
					.filter((o) => o.status === 'delivered')
					.reduce((s, o) => s + Number(o.total_amount), 0),
				avgOrderValue:
					orders.length > 0
						? orders.reduce((s, o) => s + Number(o.total_amount), 0) / orders.length
						: 0,
				needsAttention: { staleDrafts: 0, overdueShipments: 0, total: 0 },
				conversion: { submitted: 0, converted: 0, rate: 0 }
			}
		};
	}

	if (!organization)
		return {
			orders: [],
			seasons: [],
			brands: [],
			showDates: [],
			reps: [] as Array<{ id: string; name: string }>,
			isBrandOrg: false,
			metrics: {
				pipelineValue: 0,
				pipelineCount: 0,
				deliveredRevenue: 0,
				avgOrderValue: 0,
				needsAttention: { staleDrafts: 0, overdueShipments: 0, total: 0 },
				conversion: { submitted: 0, converted: 0, rate: 0 }
			}
		};

	// ── Brand org: federated orders ────────────────────────────────────────
	if (orgType === 'brand') {
		let federatedOrders = await listFederatedOrders(supabaseAdmin, organization.id);
		if (status) federatedOrders = federatedOrders.filter((o) => o.status === status);
		if (repOrgId) federatedOrders = federatedOrders.filter((o) => o.rep_org_id === repOrgId);
		if (seasonId) federatedOrders = federatedOrders.filter((o) => o.season_id === seasonId);
		if (brandId) federatedOrders = federatedOrders.filter((o) => o.brand_id === brandId);

		// Reshape to match the rep-side row structure the page already renders.
		const orders = federatedOrders.map((o) => ({
			id: o.id,
			order_number: o.order_number,
			status: o.status,
			total_amount: o.total_amount,
			created_at: o.created_at,
			expected_ship_date: o.expected_ship_date,
			start_ship_date: o.start_ship_date,
			season_id: o.season_id,
			brand_id: o.brand_id,
			account_id: o.account_id,
			freeform_name: o.freeform_name,
			connection_id: o.connection_id,
			brands: o.brand_name ? { name: o.brand_name } : null,
			accounts: o.account_name ? { business_name: o.account_name } : null,
			seasons: o.season_name ? { name: o.season_name } : null,
			source_org: { id: o.rep_org_id, name: o.rep_org_name }
		}));

		// Unique brands / seasons / reps for filter chips — derived from the federated set.
		const brandMap = new Map<string, { id: string; name: string }>();
		const seasonMap = new Map<string, { id: string; name: string }>();
		const repMap = new Map<string, { id: string; name: string }>();
		for (const o of federatedOrders) {
			if (o.brand_id && o.brand_name) brandMap.set(o.brand_id, { id: o.brand_id, name: o.brand_name });
			if (o.season_id && o.season_name)
				seasonMap.set(o.season_id, { id: o.season_id, name: o.season_name });
			repMap.set(o.rep_org_id, { id: o.rep_org_id, name: o.rep_org_name });
		}

		// Metrics (same shape as rep side)
		const now = new Date();
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		const todayStr = now.toISOString().split('T')[0];
		const pipelineStatuses = new Set(['draft', 'submitted', 'confirmed']);
		const convertedStatuses = new Set(['confirmed', 'shipped', 'delivered']);
		let pipelineValue = 0,
			pipelineCount = 0,
			deliveredRevenue = 0,
			deliveredCount = 0,
			staleDrafts = 0,
			overdueShipments = 0,
			submittedCount = 0,
			convertedCount = 0;
		for (const o of orders) {
			const amount = Number(o.total_amount) || 0;
			if (pipelineStatuses.has(o.status)) {
				pipelineValue += amount;
				pipelineCount++;
			}
			if (o.status === 'delivered') {
				deliveredRevenue += amount;
				deliveredCount++;
			}
			if (o.status === 'draft' && new Date(o.created_at) < sevenDaysAgo) staleDrafts++;
			if (
				(o.status === 'submitted' || o.status === 'confirmed') &&
				o.expected_ship_date &&
				o.expected_ship_date < todayStr
			)
				overdueShipments++;
			if (o.status !== 'draft') submittedCount++;
			if (convertedStatuses.has(o.status)) convertedCount++;
		}

		return {
			orders,
			seasons: [...seasonMap.values()],
			brands: [...brandMap.values()],
			reps: [...repMap.values()],
			showDates: [],
			isBrandOrg: true,
			metrics: {
				pipelineValue,
				pipelineCount,
				deliveredRevenue,
				avgOrderValue:
					deliveredCount > 0
						? deliveredRevenue / deliveredCount
						: orders.length > 0
							? orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) / orders.length
							: 0,
				needsAttention: {
					staleDrafts,
					overdueShipments,
					total: staleDrafts + overdueShipments
				},
				conversion: {
					submitted: submittedCount,
					converted: convertedCount,
					rate: submittedCount > 0 ? convertedCount / submittedCount : 0
				}
			}
		};
	}

	const isSales = locals.membership?.role === 'sales';

	let query = supabase
		.from('orders')
		.select(
			'*, brands(name), accounts(business_name), seasons(name), show_dates(id, show_id, year, month, city, state, shows(name)), profiles!orders_created_by_fkey(display_name), source_types(name), season_deliveries!delivery_id(label, delivery_month, delivery_day)'
		)
		.eq('organization_id', organization.id)
		.order('created_at', { ascending: false });

	if (isSales) query = query.eq('created_by', locals.user?.id);
	if (status) query = query.eq('status', status);
	if (seasonId) query = query.eq('season_id', seasonId);
	if (year) query = query.eq('order_year', parseInt(year));
	if (brandId) query = query.eq('brand_id', brandId);
	if (showDateId) query = query.eq('show_date_id', showDateId);

	const [ordersResult, seasonsResult, brandsResult, showDatesResult] = await Promise.all([
		query,
		supabase
			.from('seasons')
			.select('*')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('sort_order'),
		supabase
			.from('brands')
			.select('id, name')
			.eq('organization_id', organization.id)
			.eq('is_active', true)
			.order('name'),
		supabase
			.from('show_dates')
			.select('id, show_id, year, month, city, state, shows(name)')
			.eq('organization_id', organization.id)
			.order('year')
			.order('month')
	]);

	const orders = ordersResult.data ?? [];

	// Compute analytics metrics from orders
	const now = new Date();
	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	const todayStr = now.toISOString().split('T')[0];

	const pipelineStatuses = new Set(['draft', 'submitted', 'confirmed']);
	const convertedStatuses = new Set(['confirmed', 'shipped', 'delivered']);

	let pipelineValue = 0;
	let pipelineCount = 0;
	let deliveredRevenue = 0;
	let deliveredCount = 0;
	let staleDrafts = 0;
	let overdueShipments = 0;
	let submittedCount = 0;
	let convertedCount = 0;

	for (const o of orders) {
		const amount = Number(o.total_amount) || 0;

		if (pipelineStatuses.has(o.status)) {
			pipelineValue += amount;
			pipelineCount++;
		}
		if (o.status === 'delivered') {
			deliveredRevenue += amount;
			deliveredCount++;
		}
		if (o.status === 'draft' && new Date(o.created_at) < sevenDaysAgo) {
			staleDrafts++;
		}
		if (
			(o.status === 'submitted' || o.status === 'confirmed') &&
			o.expected_ship_date &&
			o.expected_ship_date < todayStr
		) {
			overdueShipments++;
		}
		if (o.status !== 'draft') {
			submittedCount++;
		}
		if (convertedStatuses.has(o.status)) {
			convertedCount++;
		}
	}

	const metrics = {
		pipelineValue,
		pipelineCount,
		deliveredRevenue,
		avgOrderValue:
			deliveredCount > 0
				? deliveredRevenue / deliveredCount
				: orders.length > 0
					? orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) / orders.length
					: 0,
		needsAttention: {
			staleDrafts,
			overdueShipments,
			total: staleDrafts + overdueShipments
		},
		conversion: {
			submitted: submittedCount,
			converted: convertedCount,
			rate: submittedCount > 0 ? convertedCount / submittedCount : 0
		}
	};

	return {
		orders,
		seasons: seasonsResult.data ?? [],
		brands: brandsResult.data ?? [],
		showDates: showDatesResult.data ?? [],
		reps: [] as Array<{ id: string; name: string }>,
		isBrandOrg: false,
		metrics
	};
};
