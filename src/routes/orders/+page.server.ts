import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { supabase, organization } = locals;

	const status = url.searchParams.get('status');
	const seasonId = url.searchParams.get('season');
	const year = url.searchParams.get('year');
	const brandId = url.searchParams.get('brand');
	const showDateId = url.searchParams.get('show');

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

	if (!organization) return { orders: [], seasons: [], brands: [] };

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
		metrics
	};
};
